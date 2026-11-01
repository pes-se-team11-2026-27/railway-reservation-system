'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');

const app = createApp();
afterAll(() => pool.end());

const quote = (q) => request(app).get('/api/fares').query(q);

describe('TC-PAY-01 fare breakup', () => {
  test('SBC to MAS on 12608, SL, 1 passenger totals Rs 200', async () => {
    const res = await quote({ train: '12608', from: 'SBC', to: 'MAS', class: 'SL', passengers: 1 });
    expect(res.status).toBe(200);
    expect(res.body.totalRupees).toBe('200.00');
    expect(res.body.distanceKm).toBe(362);
  });

  test('the shown parts add up to the total for three sample journeys', async () => {
    const journeys = [
      { train: '12608', from: 'SBC', to: 'MAS', class: '3A', passengers: 2 },
      { train: '12640', from: 'KPD', to: 'MAS', class: 'SL', passengers: 1 },
      { train: '12658', from: 'SBC', to: 'BWT', class: '3A', passengers: 4 },
    ];
    for (const j of journeys) {
      const res = await quote(j);
      const sum = res.body.breakup.reduce((s, line) => s + Number(line.amount), 0);
      expect(sum.toFixed(2)).toBe(res.body.totalRupees);
    }
  });

  test('a future fare rule does not change today\'s fare', async () => {
    await pool.query(`INSERT INTO fare_rules (class_code, paise_per_km, min_km, reservation_paise, gst_bps, convenience_paise, effective_from)
                      VALUES ('SL', 90, 200, 2000, 0, 1500, now() + interval '1 day')`);
    const res = await quote({ train: '12608', from: 'SBC', to: 'MAS', class: 'SL' });
    expect(res.body.totalRupees).toBe('200.00');
    await pool.query(`DELETE FROM fare_rules WHERE effective_from > now()`);
  });

  test('wrong direction is refused', async () => {
    const res = await quote({ train: '12608', from: 'MAS', to: 'SBC', class: 'SL' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_ON_ROUTE');
  });

  test('more than 6 passengers or none is refused (boundary)', async () => {
    expect((await quote({ train: '12608', from: 'SBC', to: 'MAS', class: 'SL', passengers: 7 })).status).toBe(400);
    expect((await quote({ train: '12608', from: 'SBC', to: 'MAS', class: 'SL', passengers: 0 })).status).toBe(400);
  });

  test('class with no fare rule returns 404 (error case)', async () => {
    expect((await quote({ train: '12608', from: 'SBC', to: 'MAS', class: '1A' })).status).toBe(404);
  });

  test('fare page shows the breakup', async () => {
    const res = await request(app).get('/fare').query({ train: '12608', from: 'SBC', to: 'MAS', class: '3A', passengers: 1 });
    expect(res.text).toContain('513.75');
  });
});
