'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { getFareRule } = require('../../src/modules/fare/service');
const { getSetting } = require('../../src/settings');
const { signInStaff } = require('../helpers/staff');

const app = createApp();
afterAll(() => pool.end());

let admin;
beforeAll(async () => { admin = await signInStaff(app, 'admin1'); });

const DAY = 24 * 3600 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY);
const SL_RULE = { classCode: 'SL', paisePerKm: 90, minKm: 200, reservationPaise: 2000, gstBps: 0, conveniencePaise: 1500 };

describe('TC-ADM-01 rules with an effective date', () => {
  test('a fare rule dated in the future does not change today\'s fare, and applies from its date', async () => {
    const starts = inDays(3);
    const res = await admin.post('/api/admin/fare-rules').send({ ...SL_RULE, effectiveFrom: starts.toISOString() });
    expect(res.status).toBe(201);

    const today = await request(app).get('/api/fares').query({ train: '12608', from: 'SBC', to: 'MAS', class: 'SL' });
    expect(today.body.totalRupees).toBe('200.00');

    expect((await getFareRule('SL', new Date(starts.getTime() - 60000))).paise_per_km).toBe(45);
    expect((await getFareRule('SL', new Date(starts.getTime() + 60000))).paise_per_km).toBe(90);
  });

  test('the change is written to the audit log with who, what and before and after', async () => {
    const starts = inDays(4);
    await admin.post('/api/admin/fare-rules').send({ ...SL_RULE, paisePerKm: 60, effectiveFrom: starts.toISOString() }).expect(201);
    const log = await admin.get('/api/audit').query({ actor: 'admin1', action: 'FARE_CHANGE' });
    const entry = log.body.find((e) => e.details.effectiveFrom === starts.toISOString());
    expect(entry).toBeTruthy();
    expect(entry.target).toBe('fare rule SL');
    expect(entry.details.after.paise_per_km).toBe(60);
    expect(entry.details.before.paise_per_km).toBe(90);
  });

  test('a quota rule change starts at its time; the value in force now is unchanged', async () => {
    const starts = inDays(5);
    const res = await admin.post('/api/admin/quota-rules').send({ key: 'tatkal_open_time', value: '11:00', effectiveFrom: starts.toISOString() });
    expect(res.status).toBe(201);
    expect(await getSetting('tatkal_open_time')).toBe('10:00');
    expect(await getSetting('tatkal_open_time', new Date(starts.getTime() + 60000))).toBe('11:00');
    const log = await admin.get('/api/audit').query({ action: 'QUOTA_CHANGE' });
    expect(log.body.some((e) => e.target === 'tatkal_open_time' && e.details.after === '11:00' && e.details.before === '10:00')).toBe(true);
    await pool.query(`DELETE FROM settings WHERE key = 'tatkal_open_time' AND value = '11:00'`);
  });

  test('the rule lists show what is in force and what is scheduled', async () => {
    const rules = (await admin.get('/api/admin/fare-rules')).body;
    expect(rules.filter((r) => r.classCode === 'SL' && r.state === 'CURRENT')).toHaveLength(1);
    expect(rules.some((r) => r.classCode === 'SL' && r.state === 'SCHEDULED')).toBe(true);
    const quotas = (await admin.get('/api/admin/quota-rules')).body;
    expect(quotas.map((q) => q.key)).toEqual(['tatkal_open_time', 'max_passengers_general', 'max_passengers_tatkal']);
  });
});

describe('admin rules are checked (error and boundary cases)', () => {
  test('a rule cannot start in the past', async () => {
    const res = await admin.post('/api/admin/fare-rules').send({ ...SL_RULE, effectiveFrom: inDays(-1).toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BACKDATED');
  });

  test('out of range values and unknown classes are refused', async () => {
    const at = inDays(6).toISOString();
    expect((await admin.post('/api/admin/fare-rules').send({ ...SL_RULE, paisePerKm: 0, effectiveFrom: at })).status).toBe(400);
    expect((await admin.post('/api/admin/fare-rules').send({ ...SL_RULE, gstBps: 2801, effectiveFrom: at })).status).toBe(400);
    expect((await admin.post('/api/admin/fare-rules').send({ ...SL_RULE, gstBps: 2800, effectiveFrom: at })).status).toBe(201);
    expect((await admin.post('/api/admin/fare-rules').send({ ...SL_RULE, classCode: '1A', effectiveFrom: at })).status).toBe(400);
  });

  test('two rules for the same class cannot start at the same moment', async () => {
    const at = inDays(7).toISOString();
    await admin.post('/api/admin/fare-rules').send({ ...SL_RULE, effectiveFrom: at }).expect(201);
    const res = await admin.post('/api/admin/fare-rules').send({ ...SL_RULE, effectiveFrom: at });
    expect(res.status).toBe(409);
  });

  test('quota limits stay within the SRS limits (boundary)', async () => {
    const at = inDays(8).toISOString();
    expect((await admin.post('/api/admin/quota-rules').send({ key: 'max_passengers_tatkal', value: '5', effectiveFrom: at })).status).toBe(400);
    expect((await admin.post('/api/admin/quota-rules').send({ key: 'tatkal_open_time', value: '25:00', effectiveFrom: at })).status).toBe(400);
    expect((await admin.post('/api/admin/quota-rules').send({ key: 'hold_minutes', value: '30', effectiveFrom: at })).status).toBe(400);
  });

  test('a clerk cannot change rules and nobody can without signing in', async () => {
    const clerk = await signInStaff(app, 'clerk1');
    expect((await clerk.post('/api/admin/fare-rules').send({ ...SL_RULE, effectiveFrom: inDays(9).toISOString() })).status).toBe(403);
    expect((await request(app).get('/api/admin/fare-rules')).status).toBe(401);
  });
});

describe('administration pages', () => {
  test('the console links to fares, quotas and the audit log', async () => {
    const page = await admin.get('/admin');
    for (const link of ['/admin/fares', '/admin/quotas', '/admin/audit']) expect(page.text).toContain(link);
  });

  test('a fare rule can be added from the form', async () => {
    const local = new Date(Date.now() + 10 * DAY);
    const value = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}T09:30`;
    const res = await admin.post('/admin/fares').type('form').send({
      classCode: '3A', paisePerKm: '130', minKm: '300', reservationPaise: '4000', gstBps: '500', conveniencePaise: '1500', effectiveFrom: value,
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('New 3A fare rule saved');
    expect(res.text).toContain('Scheduled');
  });

  test('the audit page lists entries and filters by person', async () => {
    const page = await admin.get('/admin/audit').query({ actor: 'admin1' });
    expect(page.status).toBe(200);
    expect(page.text).toContain('FARE_CHANGE');
  });

  test('a clerk is refused the console pages', async () => {
    const clerk = await signInStaff(app, 'clerk1');
    expect((await clerk.get('/admin/fares')).status).toBe(403);
    expect((await request(app).get('/admin/quotas')).status).toBe(302);
  });
});
