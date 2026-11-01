'use strict';
const { pool } = require('../../src/db/pool');
const { getSetting } = require('../../src/settings');

afterAll(() => pool.end());

describe('migrations and seed data', () => {
  test('three trains with routes are loaded', async () => {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM trains');
    expect(rows[0].n).toBe(3);
  });

  test('each coach has 8 general and 2 Tatkal berths', async () => {
    const { rows } = await pool.query(
      `SELECT quota_code, count(*)::int AS n FROM berths b JOIN coaches c ON c.id = b.coach_id
        WHERE c.id = (SELECT min(id) FROM coaches) GROUP BY quota_code ORDER BY quota_code`);
    expect(rows).toEqual([{ quota_code: 'GN', n: 8 }, { quota_code: 'TQ', n: 2 }]);
  });

  test('a weekday-only train has no runs on weekends (boundary)', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM train_runs r JOIN trains t ON t.id = r.train_id
        WHERE t.number = '12658' AND extract(isodow FROM r.run_date) IN (6, 7)`);
    expect(rows[0].n).toBe(0);
  });

  test('settings return the active value and respect effective dates', async () => {
    expect(await getSetting('hold_minutes')).toBe('10');
    await pool.query(`INSERT INTO settings (key, value, effective_from) VALUES ('hold_minutes', '15', now() + interval '1 day')`);
    expect(await getSetting('hold_minutes')).toBe('10');
    const later = new Date(Date.now() + 2 * 86400000);
    expect(await getSetting('hold_minutes', later)).toBe('15');
    await pool.query(`DELETE FROM settings WHERE key = 'hold_minutes' AND value = '15'`);
  });

  test('unknown setting returns null (error case)', async () => {
    expect(await getSetting('no_such_key')).toBeNull();
  });
});
