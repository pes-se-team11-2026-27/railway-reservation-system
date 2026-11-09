'use strict';
const { withTransaction, pool } = require('../../db/pool');
const { getSetting } = require('../../settings');
const { AppError, notFound, conflict } = require('../../errors');
const { lockQueue } = require('../allocation/queue');
const refunds = require('../payment/refunds');
const notification = require('../notification/service');
const logger = require('../../logger');
const { parseSlabs, quoteRefund } = require('./rules');

const DEFAULTS = { cancel_slabs: '48:0,12:2500,4:5000', cancel_clerkage: '2000' };
const FLAT_DEFAULT = { SL: 6000, '3A': 18000 };
const rupees = (p) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Everything needed to price a cancellation, read with the given client.
// Hours before departure are measured to the departure from the passenger's
// boarding station (the train's first stop if none was given).
// `now` can be passed in so tests can stand at an exact distance from departure.
async function load(client, pnr, lock, now = new Date()) {
  const b = await client.query(
    `SELECT b.id, b.pnr, b.status, b.payment_tx_ref, b.created_at, h.id AS hold_id, h.user_id, h.run_id, h.class_code,
            p.amount_paise, r.chart_prepared,
            ((r.run_date + s.day_offset)::timestamp + s.departs) AS departs_at
       FROM bookings b
       JOIN holds h ON h.id = b.hold_id
       JOIN payments p ON p.tx_ref = b.payment_tx_ref
       JOIN train_runs r ON r.id = h.run_id
       JOIN train_stops s ON s.train_id = r.train_id
        AND s.station_code = coalesce(h.from_station,
              (SELECT station_code FROM train_stops f WHERE f.train_id = r.train_id ORDER BY seq LIMIT 1))
      WHERE b.pnr = $1 ${lock ? 'FOR UPDATE OF b' : ''}`, [pnr]);
  if (!b.rows.length) throw notFound('BOOKING_NOT_FOUND', 'No booking with that PNR');
  const bk = b.rows[0];
  bk.hours_before = (new Date(bk.departs_at).getTime() - now.getTime()) / 3600000;
  const pax = await client.query('SELECT seq, status, position FROM hold_passengers WHERE hold_id = $1 ORDER BY seq', [bk.hold_id]);
  const fee = await client.query(
    `SELECT convenience_paise FROM fare_rules WHERE class_code = $1 AND effective_from <= $2
      ORDER BY effective_from DESC LIMIT 1`, [bk.class_code, bk.created_at]);
  const slabs = parseSlabs((await getSetting('cancel_slabs', now, client)) || DEFAULTS.cancel_slabs);
  const flat = Number(await getSetting(`cancel_flat_${bk.class_code}`, now, client)) || FLAT_DEFAULT[bk.class_code] || 6000;
  const clerkage = Number((await getSetting('cancel_clerkage', now, client)) || DEFAULTS.cancel_clerkage);
  const convenience = fee.rows.length ? fee.rows[0].convenience_paise : 0;
  const quote = quoteRefund({
    hoursBefore: Number(bk.hours_before), slabs, flatPaise: flat, clerkagePaise: clerkage,
    farePaise: Math.max(0, bk.amount_paise - convenience), passengers: pax.rows,
  });
  return { booking: bk, passengers: pax.rows, quote, convenience };
}

function ownerOnly(auth, booking) {
  if (!auth) throw new AppError(401, 'NOT_SIGNED_IN', 'Sign in to cancel');
  if (auth.kind !== 'PASSENGER' || auth.userId !== booking.user_id) {
    throw new AppError(403, 'FORBIDDEN', 'Only the passenger who booked can cancel');
  }
}

function refusal(booking, quote) {
  if (booking.status === 'CANCELLED') return conflict('ALREADY_CANCELLED', 'This booking is already cancelled');
  if (booking.chart_prepared) return conflict('CHART_PREPARED', 'The chart is prepared; this booking can no longer be cancelled');
  if (!quote.allowed) {
    return conflict('CANCEL_CUTOFF', `Cancellation closes ${quote.cutoffHours} hours before departure (${new Date(booking.departs_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })})`);
  }
  return null;
}

// What the passenger would get back, before they confirm.
async function quote(auth, pnr, { now } = {}) {
  const { booking, quote: q, convenience } = await load(pool, pnr, false, now);
  ownerOnly(auth, booking);
  const refused = refusal(booking, q);
  return {
    pnr, canCancel: !refused, reason: refused ? refused.message : null, cutoffHours: q.cutoffHours,
    hoursBefore: Math.floor(Number(booking.hours_before)), paidPaise: booking.amount_paise,
    convenienceFeePaise: convenience, lines: q.lines, refundPaise: q.refundTotal,
  };
}

// RRS-F-016: each freed berth goes to the earliest RAC passenger of a paid
// booking on the same run and class, and each freed RAC place to the
// earliest waitlisted one, in queue order.
async function promote(client, { runId, classCode, freedBerths, freedRac }) {
  const moves = [];
  const racPlaces = [...freedRac];
  for (const berthId of freedBerths) {
    const rac = await client.query(
      `SELECT p.id, p.hold_id, p.seq, p.position FROM hold_passengers p JOIN holds h ON h.id = p.hold_id
        WHERE h.run_id = $1 AND h.class_code = $2 AND h.status = 'CONFIRMED' AND p.status = 'RAC'
        ORDER BY p.position, p.id LIMIT 1 FOR UPDATE OF p`, [runId, classCode]);
    if (!rac.rows.length) break;
    const r = rac.rows[0];
    await client.query(`UPDATE hold_passengers SET status = 'CNF', berth_id = $2, position = NULL WHERE id = $1`, [r.id, berthId]);
    await client.query(`UPDATE inventory SET status = 'BOOKED', hold_id = $3, hold_expires_at = NULL WHERE run_id = $1 AND berth_id = $2`, [runId, berthId, r.hold_id]);
    const where = await client.query('SELECT c.coach_no, b.berth_no FROM berths b JOIN coaches c ON c.id = b.coach_id WHERE b.id = $1', [berthId]);
    moves.push({ holdId: r.hold_id, seq: r.seq, from: `RAC ${r.position}`, to: `${where.rows[0].coach_no}/${where.rows[0].berth_no}` });
    racPlaces.push(r.position);
  }
  for (const position of racPlaces.sort((a, b) => a - b)) {
    const wl = await client.query(
      `SELECT p.id, p.hold_id, p.seq, p.position FROM hold_passengers p JOIN holds h ON h.id = p.hold_id
        WHERE h.run_id = $1 AND h.class_code = $2 AND h.status = 'CONFIRMED' AND p.status = 'WL'
        ORDER BY p.position, p.id LIMIT 1 FOR UPDATE OF p`, [runId, classCode]);
    if (!wl.rows.length) break;
    const w = wl.rows[0];
    await client.query(`UPDATE hold_passengers SET status = 'RAC', position = $2 WHERE id = $1`, [w.id, position]);
    moves.push({ holdId: w.hold_id, seq: w.seq, from: `WL ${w.position}`, to: `RAC ${position}` });
  }
  // Each promoted passenger's booking owner is told (SAD ADR-03 outbox).
  for (const m of moves) {
    const who = await client.query(
      `SELECT b.id AS booking_id, b.pnr, u.mobile, u.email FROM bookings b JOIN holds h ON h.id = b.hold_id
         JOIN users u ON u.id = h.user_id WHERE h.id = $1`, [m.holdId]);
    if (!who.rows.length) continue;
    const w = who.rows[0];
    const body = `PNR ${w.pnr}: passenger ${m.seq} moved from ${m.from} to ${m.to}.`;
    await notification.queue(client, { bookingId: w.booking_id, kind: 'PROMOTION', channel: 'SMS', recipient: w.mobile, body });
    await notification.queue(client, { bookingId: w.booking_id, kind: 'PROMOTION', channel: 'EMAIL', recipient: w.email, body });
    m.pnr = w.pnr;
  }
  return moves;
}

// RRS-F-015: cancels a paid booking before the cutoff, refunds by the slab
// rules and promotes the queue, all in one transaction.
async function cancel(auth, pnr, { now } = {}) {
  const result = await withTransaction(async (client) => {
    const first = await load(client, pnr, false, now);
    ownerOnly(auth, first.booking);
    // Same lock as booking, so a cancellation and a new booking on this run
    // and class never interleave their queue changes.
    await lockQueue(client, { runId: first.booking.run_id, classCode: first.booking.class_code });
    const { booking, passengers, quote: q } = await load(client, pnr, true, now);
    const refused = refusal(booking, q);
    if (refused) throw refused;

    await client.query(`UPDATE bookings SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1`, [booking.id]);
    await client.query(`UPDATE holds SET status = 'CANCELLED' WHERE id = $1`, [booking.hold_id]);
    const freed = await client.query(
      `UPDATE inventory SET status = 'FREE', hold_id = NULL, hold_expires_at = NULL
        WHERE hold_id = $1 AND status = 'BOOKED' RETURNING berth_id`, [booking.hold_id]);
    const freedBerths = freed.rows.map((r) => r.berth_id).sort((a, b) => a - b);
    const freedRac = passengers.filter((p) => p.status === 'RAC').map((p) => p.position);
    const moves = await promote(client, { runId: booking.run_id, classCode: booking.class_code, freedBerths, freedRac });

    let refund = null;
    if (q.refundTotal > 0) {
      refund = await refunds.issueRefund(client, { txRef: booking.payment_tx_ref, bookingId: booking.id, amountPaise: q.refundTotal, reason: 'CANCELLATION' });
    }
    return { pnr, status: 'CANCELLED', refundPaise: q.refundTotal, refundRef: refund ? refund.refundRef : null, lines: q.lines, promoted: moves };
  });
  setImmediate(() => notification.dispatchPending().catch((err) => logger.error({ err }, 'Notification dispatch failed')));
  return result;
}

module.exports = { quote, cancel, promote, rupees };
