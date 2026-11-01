'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { getRunId } = require('../helpers/fixtures');

const app = createApp();

// Overrides a setting from one second ago, so it is the active value now.
const insertedSettings = [];

async function setNow(key, value) {
  await pool.query(`INSERT INTO settings (key, value, effective_from) VALUES ($1, $2, now() - interval '1 second')`, [key, value]);
  insertedSettings.push({ key, value });
}

afterEach(async () => {
  for (const { key, value } of insertedSettings) {
    await pool.query('DELETE FROM settings WHERE key = $1 AND value = $2', [key, value]);
  }
  insertedSettings.length = 0;
});
afterAll(() => pool.end());

const pax = (n) => Array.from({ length: n }, (_, i) => ({ name: `Tatkal ${i + 1}`, age: 35, gender: 'M' }));
const tatkal = (runId, passengers) => request(app).post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'TQ', passengers });

describe('TC-BOOK-05 Tatkal window', () => {
  test('a request before the window is refused and states the opening time', async () => {
    const runId = await getRunId('12640', 4);
    const res = await tatkal(runId, pax(1));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TATKAL_NOT_OPEN');
    expect(res.body.error.message).toMatch(/opens at 10:00 on \d{4}-\d{2}-\d{2}/);
  });

  test('a request after the opening time is accepted', async () => {
    await setNow('tatkal_open_time', '00:00');
    const runId = await getRunId('12640', 1);
    const res = await tatkal(runId, pax(1));
    expect(res.status).toBe(201);
    expect(res.body.quotaCode).toBe('TQ');
    expect(res.body.passengers[0].status).toBe('CNF');
  });

  test('the opening time comes from settings, not code', async () => {
    await setNow('tatkal_open_time', '23:59');
    const runId = await getRunId('12640', 1);
    const now = new Date();
    const res = await tatkal(runId, pax(1));
    if (now.getHours() === 23 && now.getMinutes() === 59) return;
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/23:59/);
  });

  test('general quota is not affected by the Tatkal window', async () => {
    const runId = await getRunId('12640', 4);
    const res = await request(app).post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'GN', passengers: pax(1) });
    expect(res.status).toBe(201);
  });
});

describe('TC-BOOK-04 passenger limits', () => {
  test('a fifth passenger is refused on Tatkal, four are accepted (boundary)', async () => {
    await setNow('tatkal_open_time', '00:00');
    const runId = await getRunId('12640', 1);
    const five = await tatkal(runId, pax(5));
    expect(five.status).toBe(400);
    expect(five.body.error.code).toBe('TOO_MANY_PASSENGERS');
    expect((await request(app).post('/api/holds').send({ runId, classCode: '3A', quotaCode: 'TQ', passengers: pax(4) })).status).toBe(201);
  });

  test('a seventh passenger is refused on a general booking', async () => {
    const runId = await getRunId('12640', 8);
    const res = await request(app).post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'GN', passengers: pax(7) });
    expect(res.status).toBe(400);
  });
});
