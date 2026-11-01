'use strict';
const crypto = require('crypto');
const { pool } = require('../../db/pool');
const { hashPassword } = require('../auth/password');
const { getSetting } = require('../../settings');
const { AppError, badRequest, notFound, conflict } = require('../../errors');
const { registrationProblem } = require('./validation');

const otpHash = (userId, code) => crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');

// RRS-F-001: one active account per mobile number.
async function register(input) {
  const problem = registrationProblem(input);
  if (problem) {
    const err = badRequest('INVALID_' + problem.field.toUpperCase(), problem.message);
    err.field = problem.field;
    throw err;
  }
  const passwordHash = await hashPassword(input.password);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, mobile, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, mobile, email, mobile_verified`,
      [input.name.trim(), input.mobile, input.email.toLowerCase(), passwordHash],
    );
    return toAccount(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const e = conflict('MOBILE_TAKEN', 'This mobile number is already registered to an active account');
      e.field = 'mobile';
      throw e;
    }
    throw err;
  }
}

async function getAccount(userId) {
  const { rows } = await pool.query(
    'SELECT id, name, mobile, email, mobile_verified FROM users WHERE id = $1 AND active', [userId]);
  if (!rows.length) throw notFound('ACCOUNT_NOT_FOUND', 'No such account');
  return toAccount(rows[0]);
}

// RRS-F-002: a 6 digit code valid for otp_minutes. There is no SMS provider
// yet, so outside production the code is returned to the caller for testing.
async function issueOtp(userId, now = new Date()) {
  const account = await getAccount(userId);
  if (account.mobileVerified) throw conflict('ALREADY_VERIFIED', 'Mobile number is already verified');
  const minutes = Number(await getSetting('otp_minutes', now)) || 10;
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = new Date(now.getTime() + minutes * 60000);
  await pool.query(
    'INSERT INTO otp_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, otpHash(userId, code), expiresAt],
  );
  return { code, expiresAt };
}

async function verifyOtp(userId, code, now = new Date()) {
  await getAccount(userId);
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw badRequest('OTP_INVALID', 'Code must be 6 digits');
  }
  const { rows } = await pool.query(
    `SELECT id, code_hash, expires_at FROM otp_codes
      WHERE user_id = $1 AND used_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1`, [userId]);
  if (!rows.length) throw badRequest('OTP_NOT_REQUESTED', 'Request a code first');
  const otp = rows[0];
  if (new Date(otp.expires_at) <= now) throw new AppError(410, 'OTP_EXPIRED', 'Code has expired, request a new one');
  if (otp.code_hash !== otpHash(userId, code)) throw badRequest('OTP_INVALID', 'Code is incorrect');
  await pool.query('UPDATE otp_codes SET used_at = now() WHERE id = $1', [otp.id]);
  await pool.query('UPDATE users SET mobile_verified = true WHERE id = $1', [userId]);
  return getAccount(userId);
}

// RRS-F-002: an unverified account cannot reach payment. The payment module
// (Sprint 2) calls this before starting a payment.
function canProceedToPayment(account) {
  return Boolean(account && account.mobileVerified);
}

function toAccount(row) {
  return { id: row.id, name: row.name, mobile: row.mobile, email: row.email, mobileVerified: row.mobile_verified };
}

module.exports = { register, getAccount, issueOtp, verifyOtp, canProceedToPayment };
