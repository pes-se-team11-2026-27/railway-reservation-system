'use strict';
const crypto = require('crypto');
const { pool, withTransaction } = require('../../db/pool');
const { AppError, badRequest, notFound, conflict } = require('../../errors');
const gateway = require('./gateway');

const STATUSES = ['SUCCESS', 'DECLINED'];

// RRS-F-011: starts a payment for an active hold and returns the gateway's
// hosted page. The passenger types card details there, never here.
async function initiatePayment({ holdId, amountPaise } = {}) {
  if (!Number.isInteger(holdId) || holdId <= 0) throw badRequest('INVALID_HOLD', 'holdId must be a positive whole number');
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw badRequest('INVALID_AMOUNT', 'amountPaise must be a positive whole number');
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, status, expires_at <= now() AS lapsed FROM holds WHERE id = $1 FOR UPDATE`, [holdId]);
    if (!rows.length) throw notFound('HOLD_NOT_FOUND', 'No such hold');
    if (rows[0].status !== 'ACTIVE' || rows[0].lapsed) throw conflict('HOLD_NOT_ACTIVE', 'This hold has lapsed or is closed');
    const pending = await client.query(`SELECT tx_ref FROM payments WHERE hold_id = $1 AND status = 'PENDING'`, [holdId]);
    if (pending.rows.length) throw conflict('PAYMENT_IN_PROGRESS', 'A payment for this hold is already in progress');
    const txRef = 'TX' + crypto.randomBytes(6).toString('hex').toUpperCase();
    await client.query('INSERT INTO payments (tx_ref, hold_id, amount_paise) VALUES ($1, $2, $3)', [txRef, holdId, amountPaise]);
    return { txRef, amountPaise, status: 'PENDING', redirectUrl: `/gateway/pay/${txRef}` };
  });
}

// Verifies a signed gateway callback and records the result. Only the
// reference, status and token are read; anything else in the body, such as a
// card number a misbehaving gateway might send, is ignored and never stored.
async function receiveCallback(body, signature) {
  const fields = { txRef: body && body.txRef, status: body && body.status, token: body && body.token };
  if (!gateway.verify(fields, signature)) throw new AppError(401, 'BAD_SIGNATURE', 'Callback signature is not valid');
  if (!STATUSES.includes(fields.status)) throw badRequest('INVALID_STATUS', 'Unknown payment status');
  return withTransaction(async (client) => {
    await client.query('INSERT INTO payment_callbacks (tx_ref, status) VALUES ($1, $2)', [fields.txRef, fields.status]);
    const { rows } = await client.query('SELECT * FROM payments WHERE tx_ref = $1 FOR UPDATE', [fields.txRef]);
    if (!rows.length) throw notFound('PAYMENT_NOT_FOUND', 'No such payment');
    const payment = rows[0];
    let firstTime = false;
    if (payment.status === 'PENDING') {
      await client.query(
        `UPDATE payments SET status = $2, gateway_token = $3, updated_at = now() WHERE id = $1`,
        [payment.id, fields.status, fields.token || null]);
      firstTime = true;
    }
    const final = firstTime ? fields.status : payment.status;
    return { txRef: payment.tx_ref, holdId: payment.hold_id, status: final, firstTime };
  });
}

async function getPayment(txRef) {
  const { rows } = await pool.query(
    'SELECT tx_ref, hold_id, amount_paise, status, created_at, updated_at FROM payments WHERE tx_ref = $1', [txRef]);
  if (!rows.length) throw notFound('PAYMENT_NOT_FOUND', 'No such payment');
  const p = rows[0];
  return { txRef: p.tx_ref, holdId: p.hold_id, amountPaise: p.amount_paise, status: p.status, createdAt: p.created_at, updatedAt: p.updated_at };
}

module.exports = { initiatePayment, receiveCallback, getPayment };
