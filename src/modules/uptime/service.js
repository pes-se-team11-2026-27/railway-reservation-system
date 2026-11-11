'use strict';
const { pool } = require('../../db/pool');
const { badRequest } = require('../../errors');
const { computeAvailability } = require('./availability');

// One sample a minute, written only if the database answers. Called by the server.
async function recordSample(now = new Date()) {
  const started = Date.now();
  await pool.query('SELECT 1');
  const dbMs = Date.now() - started;
  await pool.query(
    `INSERT INTO uptime_samples (minute, db_ms) VALUES (date_trunc('minute', $1::timestamptz), $2)
     ON CONFLICT (minute) DO NOTHING`, [now, dbMs]);
}

// The month's availability, counted from when monitoring began (the first
// sample ever) or the start of the month, whichever is later, up to now.
async function monthlyReport(month, now = new Date()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw badRequest('INVALID_MONTH', 'Month must be YYYY-MM');
  const [y, m] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 1));
  const first = (await pool.query('SELECT min(minute) AS t FROM uptime_samples')).rows[0].t;
  const start = new Date(Math.max(monthStart.getTime(), first ? new Date(first).getTime() : now.getTime()));
  const end = new Date(Math.min(monthEnd.getTime(), now.getTime()));
  const { rows } = await pool.query(
    'SELECT minute FROM uptime_samples WHERE minute >= $1 AND minute < $2 ORDER BY minute', [start, end]);
  const result = computeAvailability(rows.map((r) => r.minute), start, end > start ? end : start);
  return { month, from: start, to: end, ...result };
}

module.exports = { recordSample, monthlyReport };
