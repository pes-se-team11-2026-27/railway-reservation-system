'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { releaseExpiredHolds } = require('../../src/modules/booking/service');
const { getRunId } = require('../helpers/fixtures');
const { verifiedPassenger } = require('../helpers/passengers');

let server;
beforeAll(() => { server = createApp().listen(0); });
afterAll(async () => { server.close(); await pool.end(); });

const one = (name = 'Kiran') => [{ name, age: 30, gender: 'M' }];
const confirmedBerths = (bodies) => bodies.flatMap((b) => (b.passengers || []).filter((p) => p.status === 'CNF').map((p) => p.berthId));

// The seeded SL coach has 8 general quota berths per run.
const GN_SL_BERTHS = 8;

describe('TC-BOOK-01 no double allocation under concurrency', () => {
  test('200 concurrent requests confirm every free berth exactly once', async () => {
    const runId = await getRunId('12608', 3);
    const responses = await Promise.all(Array.from({ length: 200 }, (_, i) =>
      request(server).post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'GN', passengers: one(`P${i}`) })));

    responses.forEach((r) => expect([201, 409]).toContain(r.status));
    const berths = confirmedBerths(responses.map((r) => r.body));
    expect(berths).toHaveLength(GN_SL_BERTHS);
    expect(new Set(berths).size).toBe(GN_SL_BERTHS);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS held, count(DISTINCT hold_id)::int AS holds FROM inventory i
         JOIN berths b ON b.id = i.berth_id JOIN coaches c ON c.id = b.coach_id
        WHERE i.run_id = $1 AND c.class_code = 'SL' AND b.quota_code = 'GN' AND i.status = 'HELD'`, [runId]);
    expect(rows[0]).toEqual({ held: GN_SL_BERTHS, holds: GN_SL_BERTHS });
  });
});

describe('TC-BOOK-02 ten minute hold', () => {
  let runId;
  beforeAll(async () => { runId = await getRunId('12640', 3); });

  const hold = (passengers, quotaCode = 'GN', classCode = 'SL') =>
    request(server).post('/api/holds').send({ runId, classCode, quotaCode, passengers });

  test('hold lasts 10 minutes and a held berth is not offered again', async () => {
    const first = await hold([1, 2, 3, 4, 5, 6].map((n) => ({ name: `Pax ${n}`, age: 20 + n, gender: 'F' })));
    expect(first.status).toBe(201);
    const minutes = (new Date(first.body.expiresAt) - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(9.9);
    expect(minutes).toBeLessThanOrEqual(10);

    const second = await hold([{ name: 'Seven', age: 40, gender: 'M' }, { name: 'Eight', age: 41, gender: 'M' }]);
    expect(second.status).toBe(201);

    const third = await hold(one('Nine'));
    const taken = confirmedBerths([first.body, second.body]);
    expect(confirmedBerths([third.body]).filter((b) => taken.includes(b))).toEqual([]);
    expect(confirmedBerths([third.body])).toEqual([]);
  });

  test('berth is offered again after the hold lapses', async () => {
    const { rows } = await pool.query(
      `SELECT h.id FROM holds h WHERE h.run_id = $1 AND h.status = 'ACTIVE' ORDER BY h.id LIMIT 1`, [runId]);
    const lapsedId = rows[0].id;
    await pool.query(`UPDATE holds SET expires_at = now() - interval '1 second' WHERE id = $1`, [lapsedId]);
    await pool.query(`UPDATE inventory SET hold_expires_at = now() - interval '1 second' WHERE hold_id = $1`, [lapsedId]);
    const lapsedBerths = (await pool.query('SELECT berth_id FROM hold_passengers WHERE hold_id = $1', [lapsedId])).rows.map((r) => r.berth_id);

    const again = await hold(one('Late'));
    expect(again.status).toBe(201);
    expect(lapsedBerths).toContain(again.body.passengers[0].berthId);

    const lapsed = await request(server).get(`/api/holds/${lapsedId}`);
    expect(lapsed.body.status).toBe('EXPIRED');
  });

  test('sweeper marks lapsed holds expired', async () => {
    const h = await hold(one('Sweep'), 'GN', '3A');
    await pool.query(`UPDATE holds SET expires_at = now() - interval '1 second' WHERE id = $1`, [h.body.id]);
    expect(await releaseExpiredHolds()).toBeGreaterThanOrEqual(1);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM inventory WHERE hold_id = $1', [h.body.id]);
    expect(rows[0].n).toBe(0);
  });

  test('releasing a hold frees its berths at once, and is idempotent', async () => {
    const h = await hold(one('Release'), 'GN', '3A');
    const berth = h.body.passengers[0].berthId;
    const rel = await request(server).delete(`/api/holds/${h.body.id}`);
    expect(rel.status).toBe(200);
    expect(rel.body.status).toBe('RELEASED');
    const { rows } = await pool.query('SELECT status FROM inventory WHERE run_id = $1 AND berth_id = $2', [runId, berth]);
    expect(rows[0].status).toBe('FREE');
    expect((await request(server).delete(`/api/holds/${h.body.id}`)).status).toBe(200);
  });
});

describe('hold request errors', () => {
  test('unknown run returns 404', async () => {
    const res = await request(server).post('/api/holds').send({ runId: 999999, classCode: 'SL', quotaCode: 'GN', passengers: one() });
    expect(res.status).toBe(404);
  });

  test('class the train does not have returns 400', async () => {
    const runId = await getRunId('12608', 7);
    const res = await request(server).post('/api/holds').send({ runId, classCode: '1A', quotaCode: 'GN', passengers: one() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CLASS_NOT_ON_TRAIN');
  });

  test('no passengers returns 400 and holds nothing', async () => {
    const runId = await getRunId('12608', 4);
    const res = await request(server).post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'GN', passengers: [] });
    expect(res.status).toBe(400);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM holds WHERE run_id = $1', [runId]);
    expect(rows[0].n).toBe(0);
  });

  test('unknown hold returns 404', async () => {
    expect((await request(server).get('/api/holds/999999')).status).toBe(404);
  });
});

describe('booking page', () => {
  test('holds berths from the form', async () => {
    const runId = await getRunId('12608', 5);
    const { agent } = await verifiedPassenger(server);
    const res = await agent.post('/book').type('form')
      .send({ runId, classCode: '3A', quotaCode: 'GN', name1: 'Form User', age1: '33', gender1: 'F' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Berths held');
    expect(res.text).toContain('CNF');
  });
});
