'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { sign } = require('../../src/modules/payment/gateway');
const cancellation = require('../../src/modules/cancellation/service');
const { getRunId } = require('../helpers/fixtures');
const { verifiedPassenger } = require('../helpers/passengers');

const app = createApp();
afterAll(() => pool.end());

let me;
beforeAll(async () => { me = await verifiedPassenger(app); });

const pax = (n, prefix = 'Traveller') => Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${'abcdef'[i]}`, age: 30 + i, gender: 'F' }));

// A paid booking: hold, pay, signed success callback. Returns its PNR and passengers.
async function book(runId, cls, n, who = me) {
  const hold = (await who.agent.post('/api/holds').send({ runId, classCode: cls, quotaCode: 'GN', fromStation: 'SBC', toStation: 'MAS', passengers: pax(n) })).body;
  const pay = (await who.agent.post('/api/payments').send({ holdId: hold.id })).body;
  const fields = { txRef: pay.txRef, status: 'SUCCESS', token: `tok_${pay.txRef}` };
  const res = await request(app).post('/api/payments/callback').set('x-gateway-signature', sign(fields)).send(fields);
  return { pnr: res.body.booking.pnr, hold, txRef: pay.txRef };
}

// The moment this booking's train leaves SBC, as the service sees it.
async function departure(pnr) {
  const { rows } = await pool.query(
    `SELECT ((r.run_date + s.day_offset)::timestamp + s.departs) AS at FROM bookings b JOIN holds h ON h.id = b.hold_id
       JOIN train_runs r ON r.id = h.run_id JOIN train_stops s ON s.train_id = r.train_id AND s.station_code = 'SBC' WHERE b.pnr = $1`, [pnr]);
  return new Date(rows[0].at);
}
const hoursBefore = (dep, h) => ({ now: new Date(dep.getTime() - h * 3600000) });
const auth = () => ({ kind: 'PASSENGER', userId: me.user.id });

describe('TC-CAN-01 cancellation refunds follow the slabs', () => {
  test('two or more days ahead: the fare less the flat charge comes back', async () => {
    const { pnr, txRef } = await book(await getRunId('12608', 18), 'SL', 1);
    const res = await me.agent.post(`/api/cancel/${pnr}`);
    expect(res.status).toBe(200);
    // Paid Rs 200 = Rs 185 fare + Rs 15 fee; Rs 60 flat charge kept
    expect(res.body).toMatchObject({ status: 'CANCELLED', refundPaise: 12500 });
    expect(res.body.refundRef).toMatch(/^RF[0-9A-F]{10}$/);
    const r = await pool.query(`SELECT reason, amount_paise FROM refunds WHERE tx_ref = $1`, [txRef]);
    expect(r.rows).toEqual([{ reason: 'CANCELLATION', amount_paise: 12500 }]);
  });

  test('either side of the 12 hour boundary, and closed under 4 hours', async () => {
    const runId = await getRunId('12640', 18);
    const a = await book(runId, '3A', 1);
    const dep = await departure(a.pnr);
    expect((await cancellation.quote(auth(), a.pnr, hoursBefore(dep, 12))).refundPaise).toBe(31875);
    expect((await cancellation.quote(auth(), a.pnr, hoursBefore(dep, 11.99))).refundPaise).toBe(24937);
    const closed = await cancellation.quote(auth(), a.pnr, hoursBefore(dep, 3.99));
    expect(closed.canCancel).toBe(false);
    expect(closed.reason).toMatch(/closes 4 hours before departure/);
    await expect(cancellation.cancel(auth(), a.pnr, hoursBefore(dep, 3.99))).rejects.toThrow(/closes 4 hours/);
    const done = await cancellation.cancel(auth(), a.pnr, hoursBefore(dep, 4));
    expect(done.refundPaise).toBe(24937);
  });

  test('the freed berths return to availability and the ticket shows cancelled', async () => {
    const runId = await getRunId('12608', 19);
    const date = (await pool.query(`SELECT to_char(run_date, 'YYYY-MM-DD') AS d FROM train_runs WHERE id = $1`, [runId])).rows[0].d;
    const before = (await request(app).get('/api/trains/12608/availability').query({ date, class: 'SL' })).body.confirmedAvailable;
    const { pnr } = await book(runId, 'SL', 2);
    expect((await request(app).get('/api/trains/12608/availability').query({ date, class: 'SL' })).body.confirmedAvailable).toBe(before - 2);
    await me.agent.post(`/api/cancel/${pnr}`).expect(200);
    expect((await request(app).get('/api/trains/12608/availability').query({ date, class: 'SL' })).body.confirmedAvailable).toBe(before);
    expect((await me.agent.get(`/ticket/${pnr}`)).text).toContain('Booking cancelled');
  });

  test('only the passenger who booked can cancel, and only once (error cases)', async () => {
    const { pnr } = await book(await getRunId('12608', 19), '3A', 1);
    const other = await verifiedPassenger(app);
    expect((await other.agent.post(`/api/cancel/${pnr}`)).status).toBe(403);
    expect((await request(app).post(`/api/cancel/${pnr}`)).status).toBe(401);
    await me.agent.post(`/api/cancel/${pnr}`).expect(200);
    const again = await me.agent.post(`/api/cancel/${pnr}`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CANCELLED');
  });

  test('after the chart is prepared, cancellation is refused', async () => {
    const runId = await getRunId('12640', 19);
    const { pnr } = await book(runId, 'SL', 1);
    await pool.query('UPDATE train_runs SET chart_prepared = true WHERE id = $1', [runId]);
    const res = await me.agent.post(`/api/cancel/${pnr}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHART_PREPARED');
    await pool.query('UPDATE train_runs SET chart_prepared = false WHERE id = $1', [runId]);
  });
});

describe('TC-CAN-02 promotion on cancellation', () => {
  test('a freed berth goes to RAC 1, and WL 1 moves up to RAC, with a message for each', async () => {
    const runId = await getRunId('12640', 20);
    await book(runId, '3A', 6);
    const target = await book(runId, '3A', 1);
    await book(runId, '3A', 1);
    const rac1 = await book(runId, '3A', 1);
    const rac2 = await book(runId, '3A', 1);
    const wl1 = await book(runId, '3A', 1);
    expect(rac1.hold.passengers[0]).toMatchObject({ status: 'RAC', position: 1 });
    expect(rac2.hold.passengers[0]).toMatchObject({ status: 'RAC', position: 2 });
    expect(wl1.hold.passengers[0]).toMatchObject({ status: 'WL', position: 1 });
    const freedBerth = target.hold.passengers[0].berthId;

    const res = await me.agent.post(`/api/cancel/${target.pnr}`).expect(200);
    expect(res.body.promoted.map((m) => `${m.from} > ${m.to}`)).toEqual([expect.stringMatching(/^RAC 1 > B1\/\d+$/), 'WL 1 > RAC 1']);

    const status = async (holdId) => (await pool.query('SELECT status, position, berth_id FROM hold_passengers WHERE hold_id = $1', [holdId])).rows[0];
    expect(await status(rac1.hold.id)).toMatchObject({ status: 'CNF', position: null, berth_id: freedBerth });
    expect(await status(rac2.hold.id)).toMatchObject({ status: 'RAC', position: 2 });
    expect(await status(wl1.hold.id)).toMatchObject({ status: 'RAC', position: 1 });
    const inv = await pool.query('SELECT status, hold_id FROM inventory WHERE run_id = $1 AND berth_id = $2', [runId, freedBerth]);
    expect(inv.rows[0]).toEqual({ status: 'BOOKED', hold_id: rac1.hold.id });

    const msgs = await pool.query(
      `SELECT DISTINCT b.pnr FROM notifications n JOIN bookings b ON b.id = n.booking_id WHERE n.kind = 'PROMOTION' AND b.pnr = ANY($1)`,
      [[rac1.pnr, wl1.pnr]]);
    expect(msgs.rows.map((r) => r.pnr).sort()).toEqual([rac1.pnr, wl1.pnr].sort());
  });

  test('with nobody waiting, the berth simply becomes free', async () => {
    const runId = await getRunId('12608', 20);
    const { pnr, hold } = await book(runId, 'SL', 1);
    const res = await me.agent.post(`/api/cancel/${pnr}`).expect(200);
    expect(res.body.promoted).toEqual([]);
    const inv = await pool.query('SELECT status FROM inventory WHERE run_id = $1 AND berth_id = $2', [runId, hold.passengers[0].berthId]);
    expect(inv.rows[0].status).toBe('FREE');
  });
});

describe('cancellation pages', () => {
  test('the passenger sees the refund first, then confirms', async () => {
    const { pnr } = await book(await getRunId('12640', 21), 'SL', 1);
    const quote = await me.agent.get(`/ticket/${pnr}/cancel`);
    expect(quote.text).toContain('You get back Rs 125.00');
    const done = await me.agent.post(`/ticket/${pnr}/cancel`);
    expect(done.text).toContain('Ticket cancelled');
    expect(done.text).toMatch(/RF[0-9A-F]{10}/);
  });

  test('someone not signed in is sent to sign in', async () => {
    const { pnr } = await book(await getRunId('12640', 21), '3A', 1);
    const res = await request(app).get(`/ticket/${pnr}/cancel`);
    expect(res.status).toBe(303);
    expect(res.headers.location).toContain('/signin?next=');
  });
});
