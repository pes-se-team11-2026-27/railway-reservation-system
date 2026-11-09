'use strict';

// Reads the current RAC and waitlist state for a run and class from active
// holds and confirmed bookings (a paid RAC or waitlist place stays taken). Called inside the booking transaction after the queue lock.
async function queueState(client, { runId, classCode, quotaCode }) {
  const { rows } = await client.query(
    `SELECT
       (SELECT positions FROM rac_capacity rc JOIN train_runs r ON r.train_id = rc.train_id
         WHERE r.id = $1 AND rc.class_code = $2) AS rac_capacity,
       count(*) FILTER (WHERE p.status = 'RAC')::int AS rac_taken,
       coalesce(max(p.position) FILTER (WHERE p.status = 'RAC'), 0)::int AS last_rac,
       coalesce(max(p.position) FILTER (WHERE p.status = 'WL' AND h.quota_code = $3), 0)::int AS last_wl
     FROM holds h JOIN hold_passengers p ON p.hold_id = h.id
     WHERE h.run_id = $1 AND h.class_code = $2
       AND (h.status = 'CONFIRMED' OR (h.status = 'ACTIVE' AND h.expires_at > now()))`,
    [runId, classCode, quotaCode],
  );
  const r = rows[0];
  return { racCapacity: r.rac_capacity || 0, racTaken: r.rac_taken, lastRac: r.last_rac, lastWl: r.last_wl };
}

// Serialises bookings for one run and class, so queue numbers are handed out
// in the order requests arrive and never repeat. Released at commit.
async function lockQueue(client, { runId, classCode }) {
  await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [runId, classCode]);
}

module.exports = { queueState, lockQueue };
