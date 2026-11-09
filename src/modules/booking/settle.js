'use strict';
const crypto = require('crypto');
const QRCode = require('qrcode');
const { pool, withTransaction } = require('../../db/pool');
const { notFound } = require('../../errors');
const logger = require('../../logger');
const notification = require('../notification/service');
const { releaseHold, getHold } = require('./service');

// A PNR is 10 digits and never starts with 0.
function generatePnr() {
  return String(crypto.randomInt(1, 10)) + String(crypto.randomInt(0, 1e9)).padStart(9, '0');
}

// The ticket message, read inside the booking transaction so it matches
// exactly what was just confirmed.
async function ticketText(client, pnr, holdId) {
  const { rows } = await client.query(
    `SELECT t.number, t.name, h.class_code, p.name AS passenger, p.status, p.position, c.coach_no, b.berth_no
       FROM holds h
       JOIN train_runs r ON r.id = h.run_id JOIN trains t ON t.id = r.train_id
       JOIN hold_passengers p ON p.hold_id = h.id
       LEFT JOIN berths b ON b.id = p.berth_id LEFT JOIN coaches c ON c.id = b.coach_id
      WHERE h.id = $1 ORDER BY p.seq`, [holdId]);
  const first = rows[0];
  const lines = rows.map((r) => `${r.passenger}: ${r.status === 'CNF' ? `${r.coach_no}/${r.berth_no}` : `${r.status} ${r.position}`}`);
  return `PNR ${pnr}. ${first.number} ${first.name}, class ${first.class_code}. ${lines.join('; ')}.`;
}

// Turns a payment result into its outcome. Safe to call any number of times
// for the same payment (RRS-F-013): the payment row is locked, and if a
// booking already exists for it the same PNR is returned and nothing is
// created, charged or sent again.
async function settlePayment({ txRef, holdId, status }) {
  if (status === 'DECLINED') {
    // RRS-F-012: no PNR, and the held berths go back to availability.
    await releaseHold(holdId);
    return { outcome: 'DECLINED' };
  }

  const result = await withTransaction(async (client) => {
    const pay = await client.query('SELECT * FROM payments WHERE tx_ref = $1 FOR UPDATE', [txRef]);
    if (!pay.rows.length || pay.rows[0].status !== 'SUCCESS') return { outcome: 'NOT_PAID' };
    const existing = await client.query('SELECT pnr FROM bookings WHERE payment_tx_ref = $1', [txRef]);
    if (existing.rows.length) return { outcome: 'CONFIRMED', pnr: existing.rows[0].pnr, firstTime: false };
    if (pay.rows[0].allocation_status === 'FAILED') return { outcome: 'ALLOCATION_FAILED' };

    const h = await client.query(
      `SELECT h.*, h.expires_at > now() AS live,
              (SELECT count(*)::int FROM hold_passengers p WHERE p.hold_id = h.id AND p.status = 'CNF') AS cnf,
              (SELECT count(*)::int FROM inventory i WHERE i.hold_id = h.id AND i.status = 'HELD') AS held
         FROM holds h WHERE h.id = $1 FOR UPDATE`, [holdId]);
    const hold = h.rows[0];
    if (!hold || hold.status !== 'ACTIVE' || !hold.live || hold.held !== hold.cnf) {
      // The money arrived after the berths were gone. No PNR; the payment is
      // marked so the refund can be made (RRS-F-014).
      await client.query(`UPDATE payments SET allocation_status = 'FAILED', updated_at = now() WHERE tx_ref = $1`, [txRef]);
      if (hold && hold.status === 'ACTIVE') {
        await client.query(`UPDATE inventory SET status = 'FREE', hold_id = NULL, hold_expires_at = NULL WHERE hold_id = $1 AND status = 'HELD'`, [holdId]);
        await client.query(`UPDATE holds SET status = 'EXPIRED' WHERE id = $1`, [holdId]);
      }
      return { outcome: 'ALLOCATION_FAILED' };
    }

    let pnr;
    let bookingId;
    for (let attempt = 0; !pnr; attempt++) {
      const candidate = generatePnr();
      const ins = await client.query(
        `INSERT INTO bookings (pnr, hold_id, payment_tx_ref) VALUES ($1, $2, $3)
         ON CONFLICT (pnr) DO NOTHING RETURNING id`, [candidate, holdId, txRef]);
      if (ins.rows.length) { pnr = candidate; bookingId = ins.rows[0].id; }
      if (attempt > 10) throw new Error('Could not allocate a PNR');
    }
    await client.query(`UPDATE inventory SET status = 'BOOKED', hold_expires_at = NULL WHERE hold_id = $1 AND status = 'HELD'`, [holdId]);
    await client.query(`UPDATE holds SET status = 'CONFIRMED' WHERE id = $1`, [holdId]);
    await client.query(`UPDATE payments SET allocation_status = 'CONFIRMED', updated_at = now() WHERE tx_ref = $1`, [txRef]);

    // Transactional outbox (SAD ADR-03): the ticket messages are written in
    // this same transaction, so a booking never exists without its messages.
    // They go to the passenger's verified mobile and email.
    const user = await client.query('SELECT mobile, email FROM users WHERE id = $1', [hold.user_id]);
    if (user.rows.length) {
      const body = await ticketText(client, pnr, holdId);
      await notification.queue(client, { bookingId, kind: 'TICKET', channel: 'SMS', recipient: user.rows[0].mobile, body });
      await notification.queue(client, { bookingId, kind: 'TICKET', channel: 'EMAIL', recipient: user.rows[0].email, body });
    }
    return { outcome: 'CONFIRMED', pnr, bookingId, firstTime: true };
  });

  // Delivery happens after the commit; failures are retried from the outbox.
  if (result.outcome === 'CONFIRMED' && result.firstTime) {
    setImmediate(() => notification.dispatchPending().catch((err) => logger.error({ err }, 'Notification dispatch failed')));
  }
  return { outcome: result.outcome, pnr: result.pnr, firstTime: result.firstTime };
}

// A booking with its passengers, payment, messages and a QR code for the ticket.
async function getBooking(pnr) {
  const b = await pool.query(
    `SELECT b.*, p.amount_paise FROM bookings b JOIN payments p ON p.tx_ref = b.payment_tx_ref WHERE b.pnr = $1`, [pnr]);
  if (!b.rows.length) throw notFound('BOOKING_NOT_FOUND', 'No booking with that PNR');
  const booking = b.rows[0];
  const hold = await getHold(booking.hold_id);
  const msgs = await pool.query(
    'SELECT channel, recipient, sent_at, reference FROM notifications WHERE booking_id = $1 ORDER BY id', [booking.id]);
  const qrSvg = await QRCode.toString(`RRS:PNR=${booking.pnr}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return {
    pnr: booking.pnr,
    status: booking.status,
    paymentRef: booking.payment_tx_ref,
    amountPaise: booking.amount_paise,
    createdAt: booking.created_at,
    train: hold.train,
    runDate: hold.runDate,
    classCode: hold.classCode,
    quotaCode: hold.quotaCode,
    from: hold.from,
    to: hold.to,
    passengers: hold.passengers,
    userId: hold.userId,
    messages: msgs.rows.map((m) => ({ channel: m.channel, to: m.channel === 'SMS' ? 'xxxxxx' + m.recipient.slice(-4) : m.recipient, sent: !!m.sent_at, reference: m.reference })),
    qrSvg,
  };
}

module.exports = { settlePayment, getBooking, generatePnr };
