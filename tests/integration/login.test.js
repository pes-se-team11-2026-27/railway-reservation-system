'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');

const app = createApp();
afterAll(() => pool.end());

let seq = 8000000000;
async function newAccount() {
  const user = { name: 'Lock Test', mobile: String(++seq), email: `l${seq}@example.com`, password: 'train2026' };
  await request(app).post('/api/accounts').send(user).expect(201);
  return user;
}
const login = (mobile, password) => request(app).post('/api/auth/login').send({ mobile, password });

describe('TC-SEC-06 password check and lockout', () => {
  test('correct password signs in', async () => {
    const u = await newAccount();
    const res = await login(u.mobile, u.password);
    expect(res.status).toBe(200);
    expect(res.body.mobile).toBe(u.mobile);
    expect(res.body).not.toHaveProperty('password_hash');
  });

  test('five failures, then the sixth attempt is locked out even with the right password', async () => {
    const u = await newAccount();
    for (let i = 0; i < 5; i++) {
      expect((await login(u.mobile, 'wrong1234')).status).toBe(401);
    }
    const sixth = await login(u.mobile, u.password);
    expect(sixth.status).toBe(423);
    expect(sixth.body.error.code).toBe('ACCOUNT_LOCKED');
    const { rows } = await pool.query('SELECT locked_until - now() AS left FROM users WHERE mobile = $1', [u.mobile]);
    expect(rows[0].left.minutes).toBeGreaterThanOrEqual(14);
  });

  test('four failures do not lock (boundary)', async () => {
    const u = await newAccount();
    for (let i = 0; i < 4; i++) await login(u.mobile, 'wrong1234');
    expect((await login(u.mobile, u.password)).status).toBe(200);
  });

  test('a successful sign in resets the failure count', async () => {
    const u = await newAccount();
    for (let i = 0; i < 4; i++) await login(u.mobile, 'wrong1234');
    await login(u.mobile, u.password).expect(200);
    for (let i = 0; i < 4; i++) await login(u.mobile, 'wrong1234');
    expect((await login(u.mobile, u.password)).status).toBe(200);
  });

  test('the account opens again after 15 minutes', async () => {
    const u = await newAccount();
    for (let i = 0; i < 5; i++) await login(u.mobile, 'wrong1234');
    await pool.query(`UPDATE users SET locked_until = now() - interval '1 second' WHERE mobile = $1`, [u.mobile]);
    expect((await login(u.mobile, u.password)).status).toBe(200);
  });

  test('unknown mobile gives the same answer as a wrong password (error case)', async () => {
    const res = await login('6000000001', 'whatever1');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('BAD_CREDENTIALS');
  });
});
