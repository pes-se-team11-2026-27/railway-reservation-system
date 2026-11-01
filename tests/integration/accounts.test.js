'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');

const app = createApp();
afterAll(() => pool.end());

let mobileSeq = 9000000000;
const newUser = () => ({ name: 'Meera Rao', mobile: String(++mobileSeq), email: `u${mobileSeq}@example.com`, password: 'train2026' });

describe('TC-REG-01 registration with unique mobile', () => {
  test('registers a new passenger, unverified', async () => {
    const res = await request(app).post('/api/accounts').send(newUser());
    expect(res.status).toBe(201);
    expect(res.body.mobileVerified).toBe(false);
    expect(res.body).not.toHaveProperty('password_hash');
  });

  test('second registration on the same mobile is refused, naming the field', async () => {
    const user = newUser();
    await request(app).post('/api/accounts').send(user).expect(201);
    const res = await request(app).post('/api/accounts').send({ ...user, email: 'other@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MOBILE_TAKEN');
    expect(res.body.error.message).toMatch(/mobile/i);
  });

  test('invalid input is refused with 400', async () => {
    const res = await request(app).post('/api/accounts').send({ ...newUser(), mobile: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_MOBILE');
  });

  test('stored password is hashed, never plain', async () => {
    const user = newUser();
    const res = await request(app).post('/api/accounts').send(user);
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [res.body.id]);
    expect(rows[0].password_hash).not.toContain(user.password);
  });
});

describe('TC-REG-02 OTP verification', () => {
  async function registered() {
    return (await request(app).post('/api/accounts').send(newUser())).body;
  }

  test('correct code verifies the mobile number', async () => {
    const acc = await registered();
    const otp = await request(app).post(`/api/accounts/${acc.id}/otp`).expect(201);
    const res = await request(app).post(`/api/accounts/${acc.id}/verify`).send({ code: otp.body.devCode });
    expect(res.status).toBe(200);
    expect(res.body.mobileVerified).toBe(true);
  });

  test('wrong code is refused and account stays unverified', async () => {
    const acc = await registered();
    const otp = await request(app).post(`/api/accounts/${acc.id}/otp`);
    const wrong = otp.body.devCode === '000000' ? '111111' : '000000';
    const res = await request(app).post(`/api/accounts/${acc.id}/verify`).send({ code: wrong });
    expect(res.status).toBe(400);
    const check = await request(app).get(`/api/accounts/${acc.id}`);
    expect(check.body.mobileVerified).toBe(false);
  });

  test('code older than 10 minutes is refused (boundary)', async () => {
    const acc = await registered();
    const otp = await request(app).post(`/api/accounts/${acc.id}/otp`);
    await pool.query(`UPDATE otp_codes SET expires_at = now() - interval '1 second' WHERE user_id = $1`, [acc.id]);
    const res = await request(app).post(`/api/accounts/${acc.id}/verify`).send({ code: otp.body.devCode });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  test('code expires 10 minutes after issue', async () => {
    const acc = await registered();
    const otp = await request(app).post(`/api/accounts/${acc.id}/otp`);
    const minutes = (new Date(otp.body.expiresAt) - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(9.9);
    expect(minutes).toBeLessThanOrEqual(10);
  });

  test('verifying without requesting a code is refused', async () => {
    const acc = await registered();
    const res = await request(app).post(`/api/accounts/${acc.id}/verify`).send({ code: '123456' });
    expect(res.body.error.code).toBe('OTP_NOT_REQUESTED');
  });

  test('unknown account returns 404 (error case)', async () => {
    const res = await request(app).post('/api/accounts/999999/otp');
    expect(res.status).toBe(404);
  });
});

describe('registration page', () => {
  test('renders the form', async () => {
    const res = await request(app).get('/register');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Create an account');
  });
});
