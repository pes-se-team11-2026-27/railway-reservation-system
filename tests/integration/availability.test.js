'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { getRunId, dateAhead } = require('../helpers/fixtures');

const app = createApp();
afterAll(() => pool.end());

const avail = (number, date, cls, quota = 'GN') =>
  request(app).get(`/api/trains/${number}/availability`).query({ date, class: cls, quota });
const hold = (runId, cls, n) => request(app).post('/api/holds').send({
  runId, classCode: cls, quotaCode: 'GN',
  passengers: Array.from({ length: n }, (_, i) => ({ name: `Avail ${i}`, age: 30, gender: 'F' })),
});

describe('TC-SRCH-02 live availability', () => {
  const date = dateAhead(10);

  test('a fresh run shows all berths, both RAC positions and no waitlist', async () => {
    const res = await avail('12608', date, 'SL');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ confirmedAvailable: 8, racAvailable: 2, waitlist: 0, classCode: 'SL', quotaCode: 'GN' });
  });

  test('count falls by one immediately after a berth is held', async () => {
    const before = (await avail('12608', date, 'SL')).body.confirmedAvailable;
    await hold(await getRunId('12608', 10), 'SL', 1).expect(201);
    const after = (await avail('12608', date, 'SL')).body.confirmedAvailable;
    expect(after).toBe(before - 1);
  });

  test('when berths run out, RAC then waitlist counts move', async () => {
    const runId = await getRunId('12640', 10);
    await hold(runId, '3A', 6).expect(201);
    await hold(runId, '3A', 2).expect(201);
    let a = (await avail('12640', date, '3A')).body;
    expect(a).toMatchObject({ confirmedAvailable: 0, racAvailable: 2, waitlist: 0 });
    await hold(runId, '3A', 3).expect(201);
    a = (await avail('12640', date, '3A')).body;
    expect(a).toMatchObject({ confirmedAvailable: 0, racAvailable: 0, waitlist: 1 });
  });

  test('a released hold gives the berth back (boundary)', async () => {
    const before = (await avail('12608', date, '3A')).body.confirmedAvailable;
    const h = await hold(await getRunId('12608', 10), '3A', 1);
    await request(app).delete(`/api/holds/${h.body.id}`).expect(200);
    expect((await avail('12608', date, '3A')).body.confirmedAvailable).toBe(before);
  });

  test('Tatkal quota is counted separately from general', async () => {
    const res = await avail('12608', date, 'SL', 'TQ');
    expect(res.body.confirmedAvailable).toBe(2);
  });

  test('unknown train or date with no run returns 404', async () => {
    expect((await avail('99999', date, 'SL')).status).toBe(404);
    expect((await avail('12608', dateAhead(60), 'SL')).status).toBe(404);
  });

  test('class not on the train or bad quota returns 400 (error case)', async () => {
    expect((await avail('12608', date, '1A')).status).toBe(400);
    expect((await avail('12608', date, 'SL', 'XX')).status).toBe(400);
  });

  test('search page shows availability and a Book link', async () => {
    const res = await request(app).get('/search').query({ from: 'SBC', to: 'MAS', date });
    expect(res.text).toMatch(/SL: \d+ available|SL: RAC|SL: WL/);
    expect(res.text).toContain('/book?runId=');
  });
});
