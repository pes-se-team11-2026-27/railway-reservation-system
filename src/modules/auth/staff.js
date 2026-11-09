'use strict';
const { pool, withTransaction } = require('../../db/pool');
const { AppError } = require('../../errors');
const { verifyPassword } = require('./password');
const { afterFailure, isLocked } = require('./lockout');
const { verifyTotp, totp } = require('./totp');
const session = require('./session');

const WRONG = () => new AppError(401, 'BAD_CREDENTIALS', 'Username or password is incorrect');

// Step 1 of staff sign in (RRS-SR-003): username and password. Returns a
// session that cannot do anything until the second factor is passed.
// Failed attempts lock the account the same way as passengers (RRS-SR-005).
async function passwordStep({ username, password } = {}) {
  if (typeof username !== 'string' || typeof password !== 'string') throw WRONG();
  const staff = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM staff WHERE username = $1 AND active FOR UPDATE', [username.trim().toLowerCase()]);
    if (!rows.length) throw WRONG();
    const s = rows[0];
    if (isLocked(s.locked_until)) throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later');
    if (!(await verifyPassword(password, s.password_hash))) {
      const next = afterFailure(s.failed_attempts);
      await client.query('UPDATE staff SET failed_attempts = $2, locked_until = $3 WHERE id = $1', [s.id, next.failedAttempts, next.lockedUntil]);
      return null;
    }
    await client.query('UPDATE staff SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [s.id]);
    return s;
  });
  if (!staff) throw WRONG();
  const token = await session.createSession({ kind: 'STAFF', staffId: staff.id, role: staff.role, mfaPassed: false });
  return { token, staffId: staff.id, staff: { username: staff.username, name: staff.name, role: staff.role }, mfaRequired: true };
}

// Step 2: the 6 digit code from the staff member's authenticator app.
async function mfaStep(auth, code) {
  if (!auth || auth.kind !== 'STAFF') throw new AppError(401, 'NOT_SIGNED_IN', 'Sign in with your password first');
  const { rows } = await pool.query('SELECT totp_secret, role, username, name FROM staff WHERE id = $1', [auth.staffId]);
  if (!rows.length || !verifyTotp(rows[0].totp_secret, String(code || ''))) {
    throw new AppError(401, 'BAD_CODE', 'That code is not right. Use the current code from your app');
  }
  await pool.query('UPDATE sessions SET mfa_passed = true WHERE id = $1', [auth.sessionId]);
  return { username: rows[0].username, name: rows[0].name, role: rows[0].role };
}

// Development helper for the demo: the code an authenticator app would show.
async function currentCodeFor(staffId) {
  const { rows } = await pool.query('SELECT totp_secret FROM staff WHERE id = $1', [staffId]);
  return rows.length ? totp(rows[0].totp_secret) : null;
}

module.exports = { passwordStep, mfaStep, currentCodeFor };
