'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { sign } = require('../../src/modules/payment/gateway');
const chart = require('../../src/modules/chart/service');
const { getRunId } = require('../helpers/fixtures');
const { verifiedPassenger } = require('../helpers/passengers');
const { signInStaff } = require('../helpers/staff');

const app = createApp();
afterAll(() => pool.end());

let me;
beforeAll(async () => { me = await verifiedPassenger(app); });

const pax = (n) => Array.from({ length: n }, (_, i) => ({ name: `Chart ${'abcdef'[i]}`, age: 30 + i, gender: 'M' }));
async function hold(runId, n) {
  return (await me.agent.post('/api/holds').send({ runId, classCode: '3A', quotaCode: 'GN', passengers: pax(n) })).body;
}
async function paidBooking(runId, n) {
  const h = await hold(runId, n);
  const pay = (await me.agent.post('/api/payments').send({ holdId: h.id })).body;
  const fields = { txRef: pay.txRef, status: 'SUCCESS', token: `tok_${pay.txRef}` };
  const res = await request(app).post('/api/payments/callback').set('x-gateway-signature', sign(fields)).send(fields);
  return { hold: h, pnr: res.body.booking.pnr, txRef: pay.txRef };
}
const passenger = async (holdId) => (await pool.query(
  'SELECT status, position, berth_id, refunded FROM hold_passengers WHERE hold_id = $1', [holdId])).rows[0];

describe('TC-CHT-01 chart preparation', () => {
  // 3A coach: 8 general berths and 2 Tatkal berths. Six plus one paid fill the
  // general berths with one unpaid hold; then RAC 1, RAC 2 and WL 1 to WL 4.
  // At chart time 3 berths are free: the unpaid one and the 2 unsold Tatkal.
  let runId; let unpaid; let rac1; let rac2; let wl; let summary;

  beforeAll(async () => {
    runId = await getRunId('12640', 22);
    await paidBooking(runId, 6);
    unpaid = await hold(runId, 1);
    await paidBooking(runId, 1);
    rac1 = await paidBooking(runId, 1);
    rac2 = await paidBooking(runId, 1);
    wl = [];
    for (let i = 0; i < 4; i++) wl.push(await paidBooking(runId, 1));
    summary = await chart.prepareChart(runId);
  });

  test('the unpaid hold is released and every free berth goes down the queue in order', async () => {
    expect(summary.holdsReleased).toBeGreaterThanOrEqual(1);
    expect((await pool.query('SELECT status FROM holds WHERE id = $1', [unpaid.id])).rows[0].status).toBe('EXPIRED');
    expect(await passenger(rac1.hold.id)).toMatchObject({ status: 'CNF', berth_id: unpaid.passengers[0].berthId });
    expect(await passenger(rac2.hold.id)).toMatchObject({ status: 'CNF' });
    expect(await passenger(wl[0].hold.id)).toMatchObject({ status: 'CNF' });
    expect(await passenger(wl[1].hold.id)).toMatchObject({ status: 'RAC' });
    expect(await passenger(wl[2].hold.id)).toMatchObject({ status: 'RAC' });
  });

  test('no berth is left empty while anyone waits, and every confirmed passenger has a berth', async () => {
    const free = await pool.query(
      `SELECT count(*)::int AS n FROM inventory i JOIN berths b ON b.id = i.berth_id JOIN coaches c ON c.id = b.coach_id
        WHERE i.run_id = $1 AND c.class_code = '3A' AND i.status = 'FREE'`, [runId]);
    expect(free.rows[0].n).toBe(0);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM hold_passengers hp JOIN holds h ON h.id = hp.hold_id
        WHERE h.run_id = $1 AND h.status = 'CONFIRMED' AND hp.status = 'CNF' AND hp.berth_id IS NULL`, [runId]);
    expect(rows[0].n).toBe(0);
    expect(summary.confirmed).toBe(10);
  });

  test('anyone still waitlisted is dropped and refunded, less the clerkage', async () => {
    const last = wl[3];
    expect(await passenger(last.hold.id)).toMatchObject({ status: 'WL', refunded: true });
    expect((await pool.query('SELECT status FROM bookings WHERE pnr = $1', [last.pnr])).rows[0].status).toBe('CANCELLED');
    const r = await pool.query(`SELECT reason, amount_paise FROM refunds WHERE tx_ref = $1`, [last.txRef]);
    // 3A: paid Rs 513.75, of which Rs 15 fee; Rs 20 clerkage kept
    expect(r.rows).toEqual([{ reason: 'CHART_WAITLIST', amount_paise: 47875 }]);
    expect(summary.waitlistRefunded).toBe(1);
  });

  test('after the chart, nothing more can be booked or cancelled on the run', async () => {
    const late = await me.agent.post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'GN', passengers: pax(1) });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('CHART_PREPARED');
    const cancel = await me.agent.post(`/api/cancel/${wl[1].pnr}`);
    expect(cancel.status).toBe(409);
    await expect(chart.prepareChart(runId)).rejects.toThrow(/already prepared/);
  });

  test('every passenger is told their final status', async () => {
    const { rows } = await pool.query(
      `SELECT b.pnr, n.body FROM notifications n JOIN bookings b ON b.id = n.booking_id WHERE n.kind = 'CHART' AND n.channel = 'SMS' AND b.pnr = ANY($1)`,
      [[rac1.pnr, wl[1].pnr, wl[3].pnr]]);
    const byPnr = Object.fromEntries(rows.map((r) => [r.pnr, r.body]));
    expect(byPnr[rac1.pnr]).toMatch(/passenger 1 B1\/\d+/);
    expect(byPnr[wl[1].pnr]).toMatch(/passenger 1 RAC \d/);
    expect(byPnr[wl[3].pnr]).toMatch(/not confirmed, refunded/);
  });
});

describe('when charts are prepared', () => {
  async function departure(runId) {
    const { rows } = await pool.query(
      `SELECT ((r.run_date + s.day_offset)::timestamp + s.departs) AS at FROM train_runs r
         JOIN train_stops s ON s.train_id = r.train_id AND s.seq = 1 WHERE r.id = $1`, [runId]);
    return new Date(rows[0].at).getTime();
  }

  test('a run becomes due 4 hours before it leaves, not a minute earlier (boundary)', async () => {
    const runId = await getRunId('12608', 23);
    const dep = await departure(runId);
    expect(await chart.dueRuns(new Date(dep - 4 * 3600000 - 60000))).not.toContain(runId);
    expect(await chart.dueRuns(new Date(dep - 4 * 3600000))).toContain(runId);
    const done = await chart.prepareDueCharts(new Date(dep - 4 * 3600000));
    expect(done.map((d) => d.runId)).toContain(runId);
    expect(await chart.dueRuns(new Date(dep - 3600000))).not.toContain(runId);
  });
});

describe('who can see and prepare charts', () => {
  test('a ticket examiner can read the full chart; a passenger and a clerk cannot', async () => {
    const runId = await getRunId('12640', 22);
    const tte = await signInStaff(app, 'tte1');
    const res = await tte.get(`/api/chart/${runId}`);
    expect(res.status).toBe(200);
    expect(res.body.chartPrepared).toBe(true);
    expect(res.body.bookings.some((b) => b.status === 'CANCELLED')).toBe(true);
    expect((await me.agent.get(`/api/chart/${runId}`)).status).toBe(403);
    expect((await (await signInStaff(app, 'clerk1')).get(`/api/chart/${runId}`)).status).toBe(403);
    expect((await tte.get(`/chart/${runId}`)).text).toContain('Chart:');
  });

  test('an administrator can prepare early, and that is audited', async () => {
    const runId = await getRunId('12608', 24);
    const admin = await signInStaff(app, 'admin1');
    const res = await admin.post(`/api/chart/${runId}/prepare`);
    expect(res.status).toBe(200);
    const log = await admin.get('/api/audit').query({ action: 'CHART_EDIT' });
    expect(log.body.some((e) => e.target === `run ${runId}`)).toBe(true);
    expect((await (await signInStaff(app, 'tte1')).post(`/api/chart/${runId}/prepare`)).status).toBe(403);
  });
});
