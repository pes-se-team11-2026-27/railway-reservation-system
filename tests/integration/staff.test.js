'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { totp } = require('../../src/modules/auth/totp');

const app = createApp();
afterAll(() => pool.end());

const SECRETS = { admin1: 'JBSWY3DPEHPK3PXP', clerk1: 'KRSXG5CTMVRXEZLU' };
const PASSWORDS = { admin1: 'Admin@2026', clerk1: 'Clerk@2026' };

async function signIn(username) {
  const agent = request.agent(app);
  await agent.post('/api/auth/staff/login').send({ username, password: PASSWORDS[username] }).expect(200);
  await agent.post('/api/auth/staff/verify').send({ code: totp(SECRETS[username]) }).expect(200);
  return agent;
}

describe('TC-SEC-04 staff roles, second factor and idle lock', () => {
  test('a clerk signs in with password and code and gets the clerk role', async () => {
    const agent = await signIn('clerk1');
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ kind: 'STAFF', role: 'CLERK', login: 'clerk1' });
  });

  test('single factor sign in is refused: a password alone opens nothing', async () => {
    const agent = request.agent(app);
    const step1 = await agent.post('/api/auth/staff/login').send({ username: 'clerk1', password: 'Clerk@2026' });
    expect(step1.body.mfaRequired).toBe(true);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('MFA_REQUIRED');
  });

  test('a wrong authenticator code is refused', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/staff/login').send({ username: 'clerk1', password: 'Clerk@2026' });
    const wrong = totp(SECRETS.clerk1) === '000000' ? '111111' : '000000';
    const res = await agent.post('/api/auth/staff/verify').send({ code: wrong });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('BAD_CODE');
  });

  test('a clerk cannot reach the administration console; an admin can', async () => {
    const clerk = await signIn('clerk1');
    const denied = await clerk.get('/admin');
    expect(denied.status).toBe(403);
    expect(denied.text).toContain('Not allowed');
    const admin = await signIn('admin1');
    const ok = await admin.get('/admin');
    expect(ok.status).toBe(200);
    expect(ok.text).toContain('Administration console');
  });

  test('a staff session idle for 5 minutes is locked (boundary)', async () => {
    const agent = await signIn('clerk1');
    await pool.query(`UPDATE sessions SET last_seen_at = now() - interval '4 minutes 50 seconds'
                       WHERE staff_id = (SELECT id FROM staff WHERE username = 'clerk1') AND revoked_at IS NULL`);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    await pool.query(`UPDATE sessions SET last_seen_at = now() - interval '5 minutes'
                       WHERE staff_id = (SELECT id FROM staff WHERE username = 'clerk1') AND revoked_at IS NULL`);
    const locked = await agent.get('/api/auth/me');
    expect(locked.status).toBe(401);
    expect(locked.body.error.code).toBe('SESSION_IDLE');
    expect((await agent.get('/api/auth/me')).body.error.code).toBe('NOT_SIGNED_IN');
  });

  test('the session token is stored only as a hash', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/staff/login').send({ username: 'admin1', password: 'Admin@2026' });
    const token = /rrs_session=([^;]+)/.exec(res.headers['set-cookie'].join(';'))[1];
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM sessions WHERE token_hash = $1', [token]);
    expect(rows[0].n).toBe(0);
    expect(res.headers['set-cookie'].join(';')).toMatch(/HttpOnly/);
  });

  test('signing out ends the session', async () => {
    const agent = await signIn('admin1');
    await agent.post('/api/auth/logout').expect(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  test('a passenger session cannot open staff pages (least privilege)', async () => {
    const user = { name: 'Session Test', mobile: '7000000001', email: 's1@example.com', password: 'train2026' };
    await request(app).post('/api/accounts').send(user).expect(201);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ mobile: user.mobile, password: user.password }).expect(200);
    expect((await agent.get('/api/auth/me')).body.kind).toBe('PASSENGER');
    expect((await agent.get('/admin')).status).toBe(403);
  });

  test('wrong passwords lock a staff account after five tries (error case)', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/staff/login').send({ username: 'admin1', password: 'nope1234' }).expect(401);
    }
    const res = await request(app).post('/api/auth/staff/login').send({ username: 'admin1', password: 'Admin@2026' });
    expect(res.status).toBe(423);
    await pool.query(`UPDATE staff SET failed_attempts = 0, locked_until = NULL WHERE username = 'admin1'`);
  });

  test('the staff sign in page shows the two steps', async () => {
    const page = await request(app).get('/staff/login');
    expect(page.text).toContain('Staff sign in');
    const step2 = await request(app).post('/staff/login').type('form').send({ username: 'clerk1', password: 'Clerk@2026' });
    expect(step2.text).toContain('Authenticator code');
  });
});
