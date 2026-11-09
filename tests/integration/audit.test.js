'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const audit = require('../../src/modules/audit/service');

const app = createApp();
afterAll(() => pool.end());

const today = new Date().toISOString().slice(0, 10);

describe('TC-ADM-02 append only audit log', () => {
  test('each of the five privileged action types is recorded with actor, target and time', async () => {
    for (const action of audit.ACTIONS) {
      await audit.record({ actor: 'admin1', action, target: `${action.toLowerCase()}-target`, details: { note: 'test' } });
    }
    const res = await request(app).get('/api/audit').query({ actor: 'admin1' });
    expect(res.status).toBe(200);
    const actions = res.body.map((e) => e.action);
    for (const a of audit.ACTIONS) expect(actions).toContain(a);
    for (const e of res.body) {
      expect(e.actor).toBe('admin1');
      expect(e.target).toBeTruthy();
      expect(new Date(e.at).toString()).not.toBe('Invalid Date');
    }
  });

  test('the log can be filtered by user and by date', async () => {
    await audit.record({ actor: 'clerk7', action: 'CLERK_OVERRIDE', target: 'hold 5' });
    const byUser = await request(app).get('/api/audit').query({ actor: 'clerk7' });
    expect(byUser.body.every((e) => e.actor === 'clerk7')).toBe(true);
    expect(byUser.body.length).toBeGreaterThanOrEqual(1);
    const byDate = await request(app).get('/api/audit').query({ actor: 'clerk7', from: today, to: today });
    expect(byDate.body.length).toBeGreaterThanOrEqual(1);
    const past = await request(app).get('/api/audit').query({ actor: 'clerk7', from: '2000-01-01', to: '2000-01-02' });
    expect(past.body).toEqual([]);
  });

  test('editing a log row fails', async () => {
    const { id } = await audit.record({ actor: 'admin1', action: 'FARE_CHANGE', target: 'SL rate' });
    await expect(pool.query(`UPDATE audit_log SET actor = 'someone else' WHERE id = $1`, [id]))
      .rejects.toThrow(/append only/);
  });

  test('deleting a log row fails, and so does emptying the table', async () => {
    const { id } = await audit.record({ actor: 'admin1', action: 'MANUAL_REFUND', target: 'PNR 123' });
    await expect(pool.query('DELETE FROM audit_log WHERE id = $1', [id])).rejects.toThrow(/append only/);
    await expect(pool.query('TRUNCATE audit_log')).rejects.toThrow(/append only/);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM audit_log WHERE id = $1', [id]);
    expect(rows[0].n).toBe(1);
  });

  test('an entry rolls back with the action it records', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await audit.record({ actor: 'admin1', action: 'QUOTA_CHANGE', target: 'rollback-check' }, client);
      await client.query('ROLLBACK');
    } finally { client.release(); }
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM audit_log WHERE target = 'rollback-check'`);
    expect(rows[0].n).toBe(0);
  });

  test('unknown actions, missing fields and bad dates are refused (error cases)', async () => {
    await expect(audit.record({ actor: 'admin1', action: 'DROP_TABLES', target: 'x' })).rejects.toThrow(/action must be/);
    await expect(audit.record({ actor: '', action: 'FARE_CHANGE', target: 'x' })).rejects.toThrow(/actor/);
    expect((await request(app).get('/api/audit').query({ from: '01-11-2026' })).status).toBe(400);
    expect((await request(app).get('/api/audit').query({ action: 'NOPE' })).status).toBe(400);
  });
});
