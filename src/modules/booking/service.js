'use strict';
const { pool, withTransaction } = require('../../db/pool');
const { getSetting } = require('../../settings');
const { badRequest, notFound, conflict } = require('../../errors');
const inventory = require('../inventory/service');
const { holdRequestProblem } = require('./validation');

// Loads the run and checks it can still be booked.
async function loadBookableRun(client, runId, classCode) {
  const { rows } = await client.query(
    `SELECT r.id, r.run_date, r.chart_prepared, r.run_date < current_date AS in_past,
            t.number, t.name,
            EXISTS (SELECT 1 FROM coaches c WHERE c.train_id = t.id AND c.class_code = $2) AS has_class
       FROM train_runs r JOIN trains t ON t.id = r.train_id
      WHERE r.id = $1`,
    [runId, classCode],
  );
  if (!rows.length) throw notFound('RUN_NOT_FOUND', 'No such train run');
  const run = rows[0];
  if (run.in_past) throw badRequest('RUN_DEPARTED', 'This train run is in the past');
  if (run.chart_prepared) throw conflict('CHART_PREPARED', 'Chart is already prepared for this run');
  if (!run.has_class) throw badRequest('CLASS_NOT_ON_TRAIN', `This train has no ${classCode} coaches`);
  return run;
}

// RRS-F-005 and RRS-F-006: holds free berths for hold_minutes while the
// passenger pays. Every passenger must get a berth or nothing is held.
async function createHold(input) {
  const problem = holdRequestProblem(input);
  if (problem) throw badRequest('INVALID_HOLD', problem);
  const { runId, classCode, quotaCode, passengers } = input;

  const holdId = await withTransaction(async (client) => {
    await loadBookableRun(client, runId, classCode);
    const minutes = Number(await getSetting('hold_minutes', new Date(), client)) || 10;

    const berths = await inventory.lockFreeBerths(client, { runId, classCode, quotaCode, limit: passengers.length });
    if (berths.length < passengers.length) {
      throw conflict('NOT_ENOUGH_BERTHS', 'Not enough free berths for all passengers');
    }

    const hold = await client.query(
      `INSERT INTO holds (run_id, class_code, quota_code, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4)) RETURNING id, expires_at`,
      [runId, classCode, quotaCode, minutes],
    );
    const { id, expires_at: expiresAt } = hold.rows[0];
    await inventory.markHeld(client, { runId, berthIds: berths.map((b) => b.berthId), holdId: id, expiresAt });

    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      await client.query(
        `INSERT INTO hold_passengers (hold_id, seq, name, age, gender, status, berth_id)
         VALUES ($1, $2, $3, $4, $5, 'CNF', $6)`,
        [id, i + 1, p.name.trim(), p.age, p.gender, berths[i].berthId],
      );
    }
    return id;
  });
  return getHold(holdId);
}

async function getHold(holdId) {
  const { rows } = await pool.query(
    `SELECT h.id, h.run_id, h.class_code, h.quota_code, h.expires_at, h.created_at,
            CASE WHEN h.status = 'ACTIVE' AND h.expires_at <= now() THEN 'EXPIRED' ELSE h.status END AS status,
            r.run_date, t.number, t.name
       FROM holds h JOIN train_runs r ON r.id = h.run_id JOIN trains t ON t.id = r.train_id
      WHERE h.id = $1`,
    [holdId],
  );
  if (!rows.length) throw notFound('HOLD_NOT_FOUND', 'No such hold');
  const h = rows[0];
  const pax = await pool.query(
    `SELECT p.seq, p.name, p.age, p.gender, p.status, p.position, c.coach_no, b.berth_no, p.berth_id
       FROM hold_passengers p
       LEFT JOIN berths b ON b.id = p.berth_id
       LEFT JOIN coaches c ON c.id = b.coach_id
      WHERE p.hold_id = $1 ORDER BY p.seq`,
    [holdId],
  );
  return {
    id: h.id,
    status: h.status,
    runId: h.run_id,
    train: { number: h.number, name: h.name },
    runDate: h.run_date,
    classCode: h.class_code,
    quotaCode: h.quota_code,
    expiresAt: h.expires_at,
    passengers: pax.rows.map((p) => ({
      seq: p.seq,
      name: p.name,
      age: p.age,
      gender: p.gender,
      status: p.status,
      position: p.position,
      berthId: p.berth_id,
      coach: p.coach_no,
      berth: p.berth_no,
    })),
  };
}

// Releases a hold early (the passenger cancels before paying). Idempotent.
async function releaseHold(holdId) {
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT status FROM holds WHERE id = $1 FOR UPDATE', [holdId]);
    if (!rows.length) throw notFound('HOLD_NOT_FOUND', 'No such hold');
    if (rows[0].status === 'CONFIRMED') throw conflict('HOLD_CONFIRMED', 'This hold is already confirmed');
    if (rows[0].status !== 'ACTIVE') return;
    await inventory.releaseHoldBerths(client, holdId);
    await client.query(`UPDATE holds SET status = 'RELEASED' WHERE id = $1`, [holdId]);
  });
  return getHold(holdId);
}

// Marks lapsed holds as EXPIRED and frees their berths. Booking already
// treats expired berths as free, so this is housekeeping, run on a timer.
async function releaseExpiredHolds() {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE holds SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expires_at <= now() RETURNING id`);
    for (const r of rows) await inventory.releaseHoldBerths(client, r.id);
    return rows.length;
  });
}

module.exports = { createHold, getHold, releaseHold, releaseExpiredHolds, loadBookableRun };
