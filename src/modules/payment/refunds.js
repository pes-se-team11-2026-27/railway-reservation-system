'use strict';
const crypto = require('crypto');
const { pool } = require('../../db/pool');
const { badRequest } = require('../../errors');
const notification = require('../notification/service');

const REASONS = ['ALLOCATION_FAILED', 'CANCELLATION', 'CHART_WAITLIST'];
const newRef = () => 'RF' + crypto.randomBytes(5).toString('hex').toUpperCase();
const rupees = (p) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The gateway's refund call. This development gateway completes at once and
// returns its reference, as the payment provider's refund API would.
async function gatewayRefund({ txRef, amountPaise }) {
  return { gatewayRef: `GW-${txRef}-${amountPaise}`, status: 'COMPLETED' };
}

// Refunds part or all of a payment, at most once per reason (RRS-F-014).
// Pass the caller's transaction client, so the refund and the event that
// caused it commit together; the passenger's message goes into the outbox
// in the same transaction (SAD ADR-03).
async function issueRefund(client, { txRef, bookingId = null, amountPaise, reason }) {
  if (!REASONS.includes(reason)) throw badRequest('INVALID_REASON', 'Unknown refund reason');
  if (!Number.isInteger(amountPaise) || amountPaise < 0) throw badRequest('INVALID_AMOUNT', 'Refund amount must be a whole number of paise');
  const pay = await client.query(
    `SELECT p.amount_paise, p.status, h.user_id FROM payments p JOIN holds h ON h.id = p.hold_id WHERE p.tx_ref = $1`, [txRef]);
  if (!pay.rows.length || pay.rows[0].status !== 'SUCCESS') throw badRequest('NOT_PAID', 'Only a successful payment can be refunded');
  if (amountPaise > pay.rows[0].amount_paise) throw badRequest('TOO_MUCH', 'A refund cannot be more than the payment');

  const inserted = await client.query(
    `INSERT INTO refunds (refund_ref, tx_ref, booking_id, amount_paise, reason) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tx_ref, reason) DO NOTHING RETURNING *`, [newRef(), txRef, bookingId, amountPaise, reason]);
  if (!inserted.rows.length) {
    const existing = await client.query('SELECT * FROM refunds WHERE tx_ref = $1 AND reason = $2', [txRef, reason]);
    return { ...toRefund(existing.rows[0]), firstTime: false };
  }
  const refund = inserted.rows[0];
  const result = await gatewayRefund({ txRef, amountPaise });
  const completedAt = result.status === 'COMPLETED' ? new Date() : null;
  const done = await client.query(
    'UPDATE refunds SET status = $2, gateway_ref = $3, completed_at = $4 WHERE id = $1 RETURNING *',
    [refund.id, result.status, result.gatewayRef, completedAt]);

  const user = await client.query('SELECT mobile, email FROM users WHERE id = $1', [pay.rows[0].user_id]);
  if (user.rows.length) {
    const body = `Refund ${refund.refund_ref} of Rs ${rupees(amountPaise)} for payment ${txRef} has been started. It reaches your account in 5 to 7 working days.`;
    await notification.queue(client, { bookingId, kind: 'REFUND', channel: 'SMS', recipient: user.rows[0].mobile, body });
    await notification.queue(client, { bookingId, kind: 'REFUND', channel: 'EMAIL', recipient: user.rows[0].email, body });
  }
  return { ...toRefund(done.rows[0]), firstTime: true };
}

async function refundsFor(txRef) {
  const { rows } = await pool.query('SELECT * FROM refunds WHERE tx_ref = $1 ORDER BY id', [txRef]);
  return rows.map(toRefund);
}

function toRefund(r) {
  return {
    refundRef: r.refund_ref, txRef: r.tx_ref, bookingId: r.booking_id, amountPaise: r.amount_paise,
    reason: r.reason, status: r.status, createdAt: r.created_at, completedAt: r.completed_at,
  };
}

module.exports = { issueRefund, refundsFor, REASONS };
