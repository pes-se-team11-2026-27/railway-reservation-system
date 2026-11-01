'use strict';
// Owns the seat inventory (SAD ADR-01). Callers pass a client that is
// already inside a transaction, so the row locks last until it commits.

// Locks up to `limit` free berths for a run, class and quota. A berth whose
// hold has expired counts as free. Rows are locked in ascending berth id
// order and locked rows are skipped, so two requests can never take the
// same berth and can never deadlock on each other (RRS-F-005).
async function lockFreeBerths(client, { runId, classCode, quotaCode, limit }) {
  if (limit <= 0) return [];
  const { rows } = await client.query(
    `SELECT i.berth_id, c.coach_no, b.berth_no
       FROM inventory i
       JOIN berths b ON b.id = i.berth_id
       JOIN coaches c ON c.id = b.coach_id
      WHERE i.run_id = $1 AND c.class_code = $2 AND b.quota_code = $3
        AND (i.status = 'FREE' OR (i.status = 'HELD' AND i.hold_expires_at <= now()))
      ORDER BY i.berth_id
      LIMIT $4
      FOR UPDATE OF i SKIP LOCKED`,
    [runId, classCode, quotaCode, limit],
  );
  return rows.map((r) => ({ berthId: r.berth_id, coachNo: r.coach_no, berthNo: r.berth_no }));
}

async function markHeld(client, { runId, berthIds, holdId, expiresAt }) {
  if (!berthIds.length) return;
  await client.query(
    `UPDATE inventory SET status = 'HELD', hold_id = $3, hold_expires_at = $4
      WHERE run_id = $1 AND berth_id = ANY($2)`,
    [runId, berthIds, holdId, expiresAt],
  );
}

// Frees every berth still held by this hold. Safe to call twice.
async function releaseHoldBerths(client, holdId) {
  await client.query(
    `UPDATE inventory SET status = 'FREE', hold_id = NULL, hold_expires_at = NULL
      WHERE hold_id = $1 AND status = 'HELD'`,
    [holdId],
  );
}

module.exports = { lockFreeBerths, markHeld, releaseHoldBerths };
