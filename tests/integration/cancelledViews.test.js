'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { sign } = require('../../src/modules/payment/gateway');
const { getRunId } = require('../helpers/fixtures');
const { verifiedPassenger } = require('../helpers/passengers');
const { signInStaff } = require('../helpers/staff');

const app = createApp();
afterAll(() => pool.end());

let me;
beforeAll(async () => { me = await verifiedPassenger(app); });

const pax = (n, prefix) => Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${'abcdef'[i]}`, age: 30 + i, gender: 'F' }));

async function book(runId, n, prefix) {
  const hold = (await me.agent.post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'GN', fromStation: 'SBC', toStation: 'MAS', passengers: pax(n, prefix) })).body;
  const pay = (await me.agent.post('/api/payments').send({ holdId: hold.id })).body;
  const fields = { txRef: pay.txRef, status: 'SUCCESS', token: `tok_${pay.txRef}` };
  const res = await request(app).post('/api/payments/callback').set('x-gateway-signature', sign(fields)).send(fields);
  return res.body.booking.pnr;
}

// TC-CAN-03 (bug #67): after a cancellation the chart, the public PNR status and
// the ticket must show the passengers as Cancelled with no berth, because the
// berth is freed and can be booked again.
describe('TC-CAN-03 a cancelled booking in every view', () => {
  let runId; let cancelled; let rebooked; let before;

  beforeAll(async () => {
    runId = await getRunId('12608', 28);
    cancelled = await book(runId, 2, 'Gone');
    before = (await request(app).get(`/api/pnr/${cancelled}`)).body;
    await me.agent.post(`/api/cancel/${cancelled}`).expect(200);
    // The freed berths go straight back to the pool and are booked again.
    rebooked = await book(runId, 2, 'Back');
  });

  test('before the cancellation the passengers are confirmed with berths', () => {
    expect(before.passengers.map((p) => p.status)).toEqual(['CNF', 'CNF']);
    expect(before.passengers.every((p) => p.berth)).toBe(true);
  });

  test('the public PNR status shows Cancelled and no berth', async () => {
    const res = await request(app).get(`/api/pnr/${cancelled}`);
    expect(res.status).toBe(200);
    expect(res.body.bookingStatus).toBe('CANCELLED');
    for (const p of res.body.passengers) expect(p).toMatchObject({ status: 'CANCELLED', berth: null });
    const page = await request(app).get('/pnr').query({ number: cancelled });
    expect(page.text).toContain('Cancelled');
    expect(page.text).not.toContain('CNF');
  });

  test('the ticket page and API show Cancelled and no berth', async () => {
    const api = (await me.agent.get(`/api/bookings/${cancelled}`)).body;
    for (const p of api.passengers) expect(p).toMatchObject({ status: 'CANCELLED', position: null, berth: null, coach: null });
    const page = (await me.agent.get(`/ticket/${cancelled}`)).text;
    expect(page).toContain('Booking cancelled');
    expect(page).toContain('Cancelled');
    expect(page).not.toContain('CNF');
  });

  test('the chart shows Cancelled and no berth, and no berth is listed twice', async () => {
    const tte = await signInStaff(app, 'tte1');
    const chart = (await tte.get(`/api/chart/${runId}`)).body;
    const gone = chart.bookings.find((b) => b.pnr === cancelled);
    expect(gone.status).toBe('CANCELLED');
    for (const p of gone.passengers) expect(p).toMatchObject({ status: 'CANCELLED', berth: null });
    const berths = chart.bookings.flatMap((b) => b.passengers.map((p) => p.berth)).filter(Boolean);
    expect(new Set(berths).size).toBe(berths.length);
    const page = (await tte.get(`/chart/${runId}`)).text;
    expect(page).toContain('Cancelled');
  });

  test('a booking that is not cancelled is unchanged', async () => {
    const res = (await request(app).get(`/api/pnr/${rebooked}`)).body;
    expect(res.bookingStatus).toBe('CONFIRMED');
    expect(res.passengers.map((p) => p.status)).toEqual(['CNF', 'CNF']);
    expect(res.passengers.every((p) => p.berth)).toBe(true);
  });
});
