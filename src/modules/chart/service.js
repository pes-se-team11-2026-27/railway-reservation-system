'use strict';
const { pool, withTransaction } = require('../../db/pool');
const { getSetting } = require('../../settings');
const { conflict, notFound } = require('../../errors');
const { lockQueue } = require('../allocation/queue');
const { promote } = require('../cancellation/service');
const { maskIfCancelled } = require('../booking/passengerStatus');
const { splitFare } = require('../cancellation/rules');
const refunds = require('../payment/refunds');
const notification = require('../notification/service');
const logger = require('../../logger');

// When the train leaves its first station: the chart time is counted from here.
const DEPARTS = `((r.run_date + s.day_offset)::timestamp + s.departs)`;
const FIRST_STOP = `JOIN train_stops s ON s.train_id = r.train_id
  AND s.seq = (SELECT min(seq) FROM train_stops f WHERE f.train_id = r.train_id)`;

// RRS-F-017: prepares the chart for one run. In one transaction:
// unpaid holds are released, free berths go to RAC and RAC places to the
// waitlist one last time, anyone still waitlisted is refunded, the run is
// frozen, and every passenger is told their final status.
async function prepareChart(runId, { now = new Date() } = {}) {
  const result = await withTransaction(async (client) => {
    const run = await client.query(
      `SELECT r.id, r.chart_prepared, t.id AS train_id FROM train_runs r JOIN trains t ON t.id = r.train_id
        WHERE r.id = $1 FOR UPDATE OF r`, [runId]);
    if (!run.rows.length) throw notFound('RUN_NOT_FOUND', 'No such train run');
    if (run.rows[0].chart_prepared) throw conflict('CHART_ALREADY_PREPARED', 'The chart for this run is already prepared');

    const classes = (await client.query(
      'SELECT DISTINCT class_code FROM coaches WHERE train_id = $1 ORDER BY 1', [run.rows[0].train_id])).rows.map((r) => r.class_code);
    for (const classCode of classes) await lockQueue(client, { runId, classCode });

    // Holds still waiting for payment do not travel.
    const lapsed = await client.query(
      `UPDATE holds SET status = 'EXPIRED' WHERE run_id = $1 AND status = 'ACTIVE' RETURNING id`, [runId]);
    if (lapsed.rows.length) {
      await client.query(`UPDATE inventory SET status = 'FREE', hold_id = NULL, hold_expires_at = NULL
                           WHERE run_id = $1 AND status = 'HELD'`, [runId]);
    }

    // Last promotion: every free berth of the class, unsold Tatkal berths
    // included. Repeated until no berth is free or nobody is left waiting,
    // because a pass can move waitlisted passengers up to RAC who can then
    // take a berth that is still free.
    const promotions = [];
    for (const classCode of classes) {
      for (;;) {
        const free = await client.query(
          `SELECT i.berth_id FROM inventory i JOIN berths b ON b.id = i.berth_id JOIN coaches c ON c.id = b.coach_id
            WHERE i.run_id = $1 AND c.class_code = $2 AND i.status = 'FREE' ORDER BY i.berth_id`, [runId, classCode]);
        if (!free.rows.length) break;
        const moves = await promote(client, { runId, classCode, freedBerths: free.rows.map((r) => r.berth_id), freedRac: [] });
        if (!moves.length) break;
        promotions.push(...moves);
      }
    }

    // Anyone still waitlisted is not on the chart: refunded, less the clerkage.
    const clerkage = Number((await getSetting('cancel_clerkage', now, client)) || 2000);
    const wlBookings = await client.query(
      `SELECT b.id, b.payment_tx_ref, h.id AS hold_id, h.class_code, p.amount_paise, b.created_at,
              (SELECT count(*)::int FROM hold_passengers x WHERE x.hold_id = h.id) AS passengers,
              array_agg(hp.seq ORDER BY hp.seq) AS wl_seqs
         FROM bookings b JOIN holds h ON h.id = b.hold_id JOIN payments p ON p.tx_ref = b.payment_tx_ref
         JOIN hold_passengers hp ON hp.hold_id = h.id AND hp.status = 'WL'
        WHERE h.run_id = $1 AND b.status = 'CONFIRMED'
        GROUP BY b.id, h.id, p.amount_paise`, [runId]);
    let waitlistRefunded = 0;
    for (const w of wlBookings.rows) {
      const fee = await client.query(
        `SELECT convenience_paise FROM fare_rules WHERE class_code = $1 AND effective_from <= $2
          ORDER BY effective_from DESC LIMIT 1`, [w.class_code, w.created_at]);
      const fare = Math.max(0, w.amount_paise - (fee.rows.length ? fee.rows[0].convenience_paise : 0));
      const shares = splitFare(fare, w.passengers);
      const amount = w.wl_seqs.reduce((sum, seq) => sum + Math.max(0, shares[seq - 1] - clerkage), 0);
      await client.query(`UPDATE hold_passengers SET refunded = true WHERE hold_id = $1 AND status = 'WL'`, [w.hold_id]);
      if (w.wl_seqs.length === w.passengers) {
        await client.query(`UPDATE bookings SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1`, [w.id]);
        await client.query(`UPDATE holds SET status = 'CANCELLED' WHERE id = $1`, [w.hold_id]);
      }
      if (amount > 0) await refunds.issueRefund(client, { txRef: w.payment_tx_ref, bookingId: w.id, amountPaise: amount, reason: 'CHART_WAITLIST' });
      waitlistRefunded += w.wl_seqs.length;
    }

    await client.query('UPDATE train_runs SET chart_prepared = true, charted_at = now() WHERE id = $1', [runId]);

    // Every passenger with a booking on this run hears their final status (outbox).
    const booked = await client.query(
      `SELECT b.id, b.pnr, u.mobile, u.email,
              string_agg('passenger ' || hp.seq || ' ' ||
                CASE WHEN hp.refunded THEN 'not confirmed, refunded'
                     WHEN hp.status = 'CNF' THEN c.coach_no || '/' || br.berth_no
                     ELSE hp.status || ' ' || hp.position END, ', ' ORDER BY hp.seq) AS lines
         FROM bookings b JOIN holds h ON h.id = b.hold_id JOIN users u ON u.id = h.user_id
         JOIN hold_passengers hp ON hp.hold_id = h.id
         LEFT JOIN berths br ON br.id = hp.berth_id LEFT JOIN coaches c ON c.id = br.coach_id
        WHERE h.run_id = $1 AND (b.status = 'CONFIRMED' OR hp.refunded)
        GROUP BY b.id, u.mobile, u.email`, [runId]);
    for (const b of booked.rows) {
      const body = `Chart prepared for PNR ${b.pnr}: ${b.lines}.`;
      await notification.queue(client, { bookingId: b.id, kind: 'CHART', channel: 'SMS', recipient: b.mobile, body });
      await notification.queue(client, { bookingId: b.id, kind: 'CHART', channel: 'EMAIL', recipient: b.email, body });
    }

    const counts = await client.query(
      `SELECT count(*) FILTER (WHERE hp.status = 'CNF')::int AS confirmed,
              count(*) FILTER (WHERE hp.status = 'RAC')::int AS rac
         FROM hold_passengers hp JOIN holds h ON h.id = hp.hold_id
        WHERE h.run_id = $1 AND h.status = 'CONFIRMED'`, [runId]);
    return { runId, ...counts.rows[0], waitlistRefunded, promotions: promotions.length, holdsReleased: lapsed.rows.length };
  });
  setImmediate(() => notification.dispatchPending().catch((err) => logger.error({ err }, 'Notification dispatch failed')));
  return result;
}

// Runs whose chart time has come: chart_hours_before (4) before the train
// leaves its first station, not yet prepared, and not departed over a day ago.
async function dueRuns(now = new Date()) {
  const hours = Number(await getSetting('chart_hours_before', now)) || 4;
  const { rows } = await pool.query(
    `SELECT r.id, ${DEPARTS} AS departs_at FROM train_runs r ${FIRST_STOP} WHERE NOT r.chart_prepared ORDER BY r.id`);
  const t = now.getTime();
  return rows
    .filter((r) => {
      const departs = new Date(r.departs_at).getTime();
      return departs - hours * 3600000 <= t && departs > t - 24 * 3600000;
    })
    .map((r) => r.id);
}

// Called by the server every minute. One run failing does not stop the others.
async function prepareDueCharts(now = new Date()) {
  const done = [];
  for (const runId of await dueRuns(now)) {
    try { done.push(await prepareChart(runId, { now })); } catch (err) {
      if (err.code !== 'CHART_ALREADY_PREPARED') logger.error({ err, runId }, 'Chart preparation failed');
    }
  }
  return done;
}

// The full chart for staff (ticket examiners and administrators): every
// booking on the run, including cancelled ones, so the handheld can say why
// a ticket is not valid (RRS-F-018).
async function getChart(runId) {
  const run = await pool.query(
    `SELECT r.id, to_char(r.run_date, 'YYYY-MM-DD') AS run_date, r.chart_prepared, r.charted_at, t.number, t.name
       FROM train_runs r JOIN trains t ON t.id = r.train_id WHERE r.id = $1`, [runId]);
  if (!run.rows.length) throw notFound('RUN_NOT_FOUND', 'No such train run');
  const rows = await pool.query(
    `SELECT b.pnr, b.status AS booking_status, h.class_code, h.from_station, h.to_station,
            hp.seq, hp.name, hp.age, hp.gender, hp.status, hp.position, hp.refunded, c.coach_no, br.berth_no
       FROM bookings b JOIN holds h ON h.id = b.hold_id JOIN hold_passengers hp ON hp.hold_id = h.id
       LEFT JOIN berths br ON br.id = hp.berth_id LEFT JOIN coaches c ON c.id = br.coach_id
      WHERE h.run_id = $1 ORDER BY b.pnr, hp.seq`, [runId]);
  const bookings = new Map();
  for (const r of rows.rows) {
    if (!bookings.has(r.pnr)) {
      bookings.set(r.pnr, { pnr: r.pnr, status: r.booking_status, classCode: r.class_code, from: r.from_station, to: r.to_station, passengers: [] });
    }
    const passenger = {
      seq: r.seq, name: r.name, age: r.age, gender: r.gender,
      status: r.refunded ? 'NOT_ON_CHART' : r.status, position: r.position,
      berth: r.coach_no ? `${r.coach_no}/${r.berth_no}` : null,
    };
    // Dropped from the chart keeps its own label; any other passenger of a
    // cancelled booking shows as cancelled with no berth (bug #67).
    bookings.get(r.pnr).passengers.push(r.refunded ? passenger : maskIfCancelled(r.booking_status, passenger));
  }
  const R = run.rows[0];
  return {
    runId: R.id, train: { number: R.number, name: R.name }, runDate: R.run_date,
    chartPrepared: R.chart_prepared, chartedAt: R.charted_at, bookings: [...bookings.values()],
  };
}

module.exports = { prepareChart, dueRuns, prepareDueCharts, getChart };
