'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool, withTransaction } = require('../../src/db/pool');
const { sign } = require('../../src/modules/payment/gateway');
const refunds = require('../../src/modules/payment/refunds');
const { getRunId } = require('../helpers/fixtures');
const { verifiedPassenger } = require('../helpers/passengers');

const app = createApp();
afterAll(() => pool.end());

let me;
beforeAll(async () => { me = await verifiedPassenger(app); });

const succeed = (txRef) => {
  const fields = { txRef, status: 'SUCCESS', token: `tok_${txRef}` };
  return request(app).post('/api/payments/callback').set('x-gateway-signature', sign(fields)).send(fields);
};

// Hold, start paying, then let the hold lapse before the money arrives.
async function latePayment(train, day, cls = 'SL') {
  const runId = await getRunId(train, day);
  const hold = (await me.agent.post('/api/holds').send({
    runId, classCode: cls, quotaCode: 'GN', passengers: [{ name: 'Late Payer', age: 40, gender: 'M' }],
  })).body;
  const pay = (await me.agent.post('/api/payments').send({ holdId: hold.id })).body;
  await pool.query(`UPDATE holds SET expires_at = now() - interval '1 second' WHERE id = $1`, [hold.id]);
  await pool.query(`UPDATE inventory SET hold_expires_at = now() - interval '1 second' WHERE hold_id = $1`, [hold.id]);
  return { hold, pay };
}

describe('TC-PAY-05 automatic refund when the berths are gone', () => {
  test('a payment that arrives after the hold lapsed is refunded in full, with a reference', async () => {
    const { pay } = await latePayment('12608', 15);
    const res = await succeed(pay.txRef);
    expect(res.body.booking).toMatchObject({ outcome: 'ALLOCATION_FAILED' });
    expect(res.body.booking.refundRef).toMatch(/^RF[0-9A-F]{10}$/);

    const list = await refunds.refundsFor(pay.txRef);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ reason: 'ALLOCATION_FAILED', status: 'COMPLETED', amountPaise: pay.amountPaise });
    expect(list[0].completedAt).toBeTruthy();
  });

  test('the passenger is told by SMS and email, with the refund reference', async () => {
    const { pay } = await latePayment('12640', 15);
    const ref = (await succeed(pay.txRef)).body.booking.refundRef;
    const { rows } = await pool.query(
      `SELECT channel, recipient, body FROM notifications WHERE kind = 'REFUND' AND body LIKE $1 ORDER BY channel`, [`%${ref}%`]);
    expect(rows.map((r) => [r.channel, r.recipient])).toEqual([['EMAIL', me.user.email], ['SMS', me.user.mobile]]);
    expect(rows[0].body).toContain('Rs 200.00');
  });

  test('repeated callbacks refund once, and every reply shows the same reference', async () => {
    const { pay } = await latePayment('12608', 15, '3A');
    const refs = [];
    for (let i = 0; i < 3; i++) refs.push((await succeed(pay.txRef)).body.booking.refundRef);
    expect(new Set(refs).size).toBe(1);
    expect(await refunds.refundsFor(pay.txRef)).toHaveLength(1);
  });

  test('the payment shows its refund, and the return page tells the passenger', async () => {
    const { pay } = await latePayment('12640', 15, '3A');
    const ref = (await succeed(pay.txRef)).body.booking.refundRef;
    const status = await request(app).get(`/api/payments/${pay.txRef}`);
    expect(status.body.refunds.map((r) => r.refundRef)).toEqual([ref]);
    const page = await me.agent.get(`/payment/return/${pay.txRef}`);
    expect(page.text).toContain(ref);
    expect(page.text).toContain('5 to 7 working days');
  });

  test('a booked payment is not refunded by mistake', async () => {
    const runId = await getRunId('12608', 16);
    const hold = (await me.agent.post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'GN', passengers: [{ name: 'On Time', age: 30, gender: 'F' }] })).body;
    const pay = (await me.agent.post('/api/payments').send({ holdId: hold.id })).body;
    expect((await succeed(pay.txRef)).body.booking.outcome).toBe('CONFIRMED');
    expect(await refunds.refundsFor(pay.txRef)).toHaveLength(0);
  });
});

describe('refund rules (boundary and error cases)', () => {
  async function paid() {
    const runId = await getRunId('12640', 16);
    const hold = (await me.agent.post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'GN', passengers: [{ name: 'Rule Test', age: 30, gender: 'F' }] })).body;
    const pay = (await me.agent.post('/api/payments').send({ holdId: hold.id })).body;
    await succeed(pay.txRef);
    return pay;
  }

  test('a refund can be the whole payment but never more', async () => {
    const pay = await paid();
    await expect(withTransaction((c) => refunds.issueRefund(c, { txRef: pay.txRef, amountPaise: pay.amountPaise + 1, reason: 'CANCELLATION' })))
      .rejects.toThrow(/more than the payment/);
    const r = await withTransaction((c) => refunds.issueRefund(c, { txRef: pay.txRef, amountPaise: pay.amountPaise, reason: 'CANCELLATION' }));
    expect(r.amountPaise).toBe(pay.amountPaise);
  });

  test('unpaid payments, unknown reasons and bad amounts are refused', async () => {
    const runId = await getRunId('12640', 16);
    const hold = (await me.agent.post('/api/holds').send({ runId, classCode: '3A', quotaCode: 'GN', passengers: [{ name: 'Unpaid', age: 30, gender: 'F' }] })).body;
    const pending = (await me.agent.post('/api/payments').send({ holdId: hold.id })).body;
    await expect(withTransaction((c) => refunds.issueRefund(c, { txRef: pending.txRef, amountPaise: 100, reason: 'CANCELLATION' })))
      .rejects.toThrow(/Only a successful payment/);
    const pay = await paid();
    await expect(withTransaction((c) => refunds.issueRefund(c, { txRef: pay.txRef, amountPaise: 100, reason: 'GOODWILL' }))).rejects.toThrow(/reason/);
    await expect(withTransaction((c) => refunds.issueRefund(c, { txRef: pay.txRef, amountPaise: -5, reason: 'CANCELLATION' }))).rejects.toThrow(/whole number/);
  });
});
