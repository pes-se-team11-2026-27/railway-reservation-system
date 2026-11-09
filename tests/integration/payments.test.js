'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { sign } = require('../../src/modules/payment/gateway');
const { getRunId } = require('../helpers/fixtures');
const { verifiedPassenger } = require('../helpers/passengers');

const app = createApp();
afterAll(() => pool.end());

// A hold made by a signed in, verified passenger (whole route SBC to MAS).
async function newHold(agent, train, day, cls = 'SL') {
  const runId = await getRunId(train, day);
  const res = await agent.post('/api/holds')
    .send({ runId, classCode: cls, quotaCode: 'GN', passengers: [{ name: 'Pay Test', age: 30, gender: 'F' }] });
  return res.body.id;
}
const callback = (body, signature) =>
  request(app).post('/api/payments/callback').set('x-gateway-signature', signature).send(body);

// Every stored text column, as one string, to look for anything card shaped.
async function storedText() {
  const { rows } = await pool.query(
    `SELECT coalesce(string_agg(row_to_json(p)::text, ' '), '') AS t FROM payments p
     UNION ALL SELECT coalesce(string_agg(row_to_json(c)::text, ' '), '') FROM payment_callbacks c`);
  return rows.map((r) => r.t).join(' ');
}

let me;
beforeAll(async () => { me = await verifiedPassenger(app); });

describe('TC-PAY-02 hosted payment, token only', () => {
  test('starting a payment returns the hosted page and a pending reference', async () => {
    const holdId = await newHold(me.agent, '12608', 11);
    const res = await me.agent.post('/api/payments').send({ holdId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING', amountPaise: 20000 });
    expect(res.body.txRef).toMatch(/^TX[0-9A-F]{12}$/);
    expect(res.body.redirectUrl).toBe(`/gateway/pay/${res.body.txRef}`);
  });

  test('the hosted page asks for no card details on our side', async () => {
    const holdId = await newHold(me.agent, '12608', 11);
    const { body } = await me.agent.post('/api/payments').send({ holdId });
    const page = await request(app).get(body.redirectUrl);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Rs 200.00');
    expect(page.text).not.toMatch(/<input[^>]*(card|cvv|cvc|expiry|pan)/i);
  });

  test('a signed success callback stores only the status and token', async () => {
    const holdId = await newHold(me.agent, '12608', 11);
    const { body } = await me.agent.post('/api/payments').send({ holdId });
    const fields = { txRef: body.txRef, status: 'SUCCESS', token: 'tok_test_1' };
    const res = await callback({ ...fields, cardNumber: '4111111111111111', cvv: '123' }, sign(fields));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'SUCCESS', firstTime: true, holdId });
    expect((await request(app).get(`/api/payments/${body.txRef}`)).body.status).toBe('SUCCESS');
    const text = await storedText();
    expect(text).not.toMatch(/4111111111111111/);
    expect(text).not.toMatch(/\b\d{13,19}\b/);
    expect(text).not.toMatch(/"cvv"/i);
  });

  test('a callback with a bad signature is refused and changes nothing', async () => {
    const holdId = await newHold(me.agent, '12640', 11);
    const { body } = await me.agent.post('/api/payments').send({ holdId });
    const res = await callback({ txRef: body.txRef, status: 'SUCCESS', token: 'tok_x' }, 'f'.repeat(64));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('BAD_SIGNATURE');
    expect((await request(app).get(`/api/payments/${body.txRef}`)).body.status).toBe('PENDING');
  });

  test('a declined payment is recorded as declined', async () => {
    const holdId = await newHold(me.agent, '12640', 11);
    const { body } = await me.agent.post('/api/payments').send({ holdId });
    const fields = { txRef: body.txRef, status: 'DECLINED', token: '' };
    expect((await callback(fields, sign(fields))).body.status).toBe('DECLINED');
  });

  test('a second payment cannot start while one is pending for the same hold', async () => {
    const holdId = await newHold(me.agent, '12640', 11, '3A');
    await me.agent.post('/api/payments').send({ holdId }).expect(201);
    const res = await me.agent.post('/api/payments').send({ holdId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_IN_PROGRESS');
  });

  test('a lapsed hold cannot be paid for (boundary)', async () => {
    const holdId = await newHold(me.agent, '12608', 11, '3A');
    await pool.query(`UPDATE holds SET expires_at = now() - interval '1 second' WHERE id = $1`, [holdId]);
    const res = await me.agent.post('/api/payments').send({ holdId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HOLD_NOT_ACTIVE');
  });

  test('paying on the test gateway page reports success and sends the passenger back', async () => {
    const holdId = await newHold(me.agent, '12640', 11, '3A');
    const { body } = await me.agent.post('/api/payments').send({ holdId });
    const page = await request(app).post(`/gateway/pay/${body.txRef}`).type('form').send({ outcome: 'success' });
    expect(page.status).toBe(303);
    expect(page.headers.location).toBe(`/payment/return/${body.txRef}`);
    expect((await request(app).get(`/api/payments/${body.txRef}`)).body.status).toBe('SUCCESS');
  });
});

describe('who may pay, and for how much (RRS-F-002, SAD 3.9)', () => {
  test('the amount is worked out on the server; an amount sent by the browser is ignored', async () => {
    const holdId = await newHold(me.agent, '12608', 13);
    const res = await me.agent.post('/api/payments').send({ holdId, amountPaise: 100 });
    expect(res.status).toBe(201);
    expect(res.body.amountPaise).toBe(20000);
  });

  test('someone who is not signed in cannot start a payment', async () => {
    const holdId = await newHold(me.agent, '12608', 13);
    const res = await request(app).post('/api/payments').send({ holdId });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NOT_SIGNED_IN');
  });

  test('an unverified account cannot reach payment (TC-REG-02)', async () => {
    const unverified = await verifiedPassenger(app, { verified: false });
    const holdId = await newHold(unverified.agent, '12608', 13);
    const res = await unverified.agent.post('/api/payments').send({ holdId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_VERIFIED');
  });

  test('a passenger cannot pay for someone else\'s hold (error case)', async () => {
    const other = await verifiedPassenger(app);
    const holdId = await newHold(me.agent, '12608', 13);
    const res = await other.agent.post('/api/payments').send({ holdId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_YOUR_HOLD');
  });

  test('unknown holds and references are refused', async () => {
    expect((await me.agent.post('/api/payments').send({ holdId: 999999 })).status).toBe(404);
    expect((await request(app).get('/api/payments/TXNOPE')).status).toBe(404);
  });
});
