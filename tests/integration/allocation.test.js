'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { getRunId } = require('../helpers/fixtures');

const app = createApp();
afterAll(() => pool.end());

const label = (p) => `${p.status}${p.position || ''}`;

describe('TC-BOOK-03 quota, then RAC, then waitlist, in request order', () => {
  test('requests beyond the free berths get RAC 1, RAC 2, then WL 1 onwards', async () => {
    const runId = await getRunId('12640', 6);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM inventory i JOIN berths b ON b.id = i.berth_id JOIN coaches c ON c.id = b.coach_id
        WHERE i.run_id = $1 AND c.class_code = 'SL' AND b.quota_code = 'GN' AND i.status = 'FREE'`, [runId]);
    const free = rows[0].n;
    const total = free + 2 + 13;

    const labels = [];
    for (let i = 0; i < total; i++) {
      const res = await request(app).post('/api/holds')
        .send({ runId, classCode: 'SL', quotaCode: 'GN', passengers: [{ name: `Req ${i + 1}`, age: 30, gender: 'M' }] });
      expect(res.status).toBe(201);
      labels.push(label(res.body.passengers[0]));
    }

    const expected = [
      ...Array(free).fill('CNF'),
      'RAC1', 'RAC2',
      ...Array.from({ length: 13 }, (_, i) => `WL${i + 1}`),
    ];
    expect(labels).toEqual(expected);
  });

  test('one booking can split across a berth, RAC and waitlist', async () => {
    const runId = await getRunId('12608', 9);
    const fill = Array.from({ length: 6 }, (_, i) => ({ name: `Fill ${i}`, age: 25, gender: 'F' }));
    await request(app).post('/api/holds').send({ runId, classCode: '3A', quotaCode: 'GN', passengers: fill }).expect(201);
    const res = await request(app).post('/api/holds').send({
      runId, classCode: '3A', quotaCode: 'GN',
      passengers: ['A', 'B', 'C', 'D', 'E'].map((n) => ({ name: `Family ${n}`, age: 40, gender: 'M' })),
    });
    expect(res.body.passengers.map(label)).toEqual(['CNF', 'CNF', 'RAC1', 'RAC2', 'WL1']);
  });

  test('a lapsed RAC hold frees its RAC position for the next request', async () => {
    const runId = await getRunId('12640', 7);
    const six = Array.from({ length: 6 }, (_, i) => ({ name: `X ${i}`, age: 30, gender: 'M' }));
    await request(app).post('/api/holds').send({ runId, classCode: '3A', quotaCode: 'GN', passengers: six });
    await request(app).post('/api/holds').send({ runId, classCode: '3A', quotaCode: 'GN', passengers: six.slice(0, 2) });
    const racHold = await request(app).post('/api/holds')
      .send({ runId, classCode: '3A', quotaCode: 'GN', passengers: [{ name: 'Rac One', age: 30, gender: 'M' }] });
    expect(label(racHold.body.passengers[0])).toBe('RAC1');
    await pool.query(`UPDATE holds SET expires_at = now() - interval '1 second' WHERE id = $1`, [racHold.body.id]);
    const next = await request(app).post('/api/holds')
      .send({ runId, classCode: '3A', quotaCode: 'GN', passengers: [{ name: 'Rac Next', age: 30, gender: 'M' }] });
    expect(next.body.passengers[0].status).toBe('RAC');
  });
});
