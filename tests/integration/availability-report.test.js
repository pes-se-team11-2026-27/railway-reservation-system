'use strict';
// TC for RRS-NF-004: the monthly availability report from minute samples.
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { recordSample, monthlyReport } = require('../../src/modules/uptime/service');
const { signInStaff } = require('../helpers/staff');

const app = createApp();
afterAll(() => pool.end());

// A fixed past month, so other tests' samples (written "now") never mix in.
const MONTH = '2025-01';
const at = (day, h, m) => new Date(Date.UTC(2025, 0, day, h, m));

beforeAll(async () => {
  await pool.query(`DELETE FROM uptime_samples WHERE minute < '2025-02-01'`);
  // Monitoring for one day, 1 January, with one 6 minute gap at 10:00.
  const rows = [];
  for (let t = at(1, 0, 0).getTime(); t < at(2, 0, 0).getTime(); t += 60000) {
    const d = new Date(t);
    if (!(d.getUTCHours() === 10 && d.getUTCMinutes() < 6)) rows.push(d);
  }
  for (const d of rows) await pool.query('INSERT INTO uptime_samples (minute, db_ms) VALUES ($1, 1)', [d]);
});

describe('monthly availability report', () => {
  test('counts from the first sample, finds the outage and checks the 99.5 percent target', async () => {
    const r = await monthlyReport(MONTH, at(2, 0, 0));
    expect(r.minutes).toBe(1440);
    expect(r.upMinutes).toBe(1434);
    expect(r.percent).toBeCloseTo(99.583, 3);
    expect(r.met).toBe(true);
    expect(r.outages).toHaveLength(1);
    expect(r.outages[0]).toMatchObject({ minutes: 6 });
    expect(r.outages[0].from.toISOString()).toBe('2025-01-01T10:00:00.000Z');
  });

  test('a sample is written once a minute, never twice for the same minute', async () => {
    const now = new Date();
    await recordSample(now);
    await recordSample(now);
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM uptime_samples WHERE minute = date_trunc('minute', $1::timestamptz)`, [now]);
    expect(rows[0].n).toBe(1);
  });

  test('administrators see the report; a bad month is refused; others are refused', async () => {
    const admin = await signInStaff(app, 'admin1');
    const page = await admin.get('/admin/availability').query({ month: MONTH });
    expect(page.status).toBe(200);
    // Seen today, all of January counts: after 1 January there are no
    // samples, so the rest of the month is one long outage. No samples, no uptime.
    expect(page.text).toMatch(/\d+\.\d{3}% available: below target/);
    expect(page.text).toContain('>6<');
    expect((await admin.get('/api/availability').query({ month: '2025-13' })).status).toBe(400);
    expect((await (await signInStaff(app, 'clerk1')).get('/api/availability')).status).toBe(403);
    expect((await request(app).get('/api/availability')).status).toBe(401);
  });
});
