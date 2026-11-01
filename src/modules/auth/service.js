'use strict';
const { withTransaction } = require('../../db/pool');
const { AppError } = require('../../errors');
const { verifyPassword } = require('./password');
const { afterFailure, isLocked } = require('./lockout');

const WRONG = () => new AppError(401, 'BAD_CREDENTIALS', 'Mobile number or password is incorrect');

// Signs a passenger in by mobile and password. The same message is used for
// an unknown mobile and a wrong password, so accounts cannot be guessed.
async function login({ mobile, password } = {}) {
  if (typeof mobile !== 'string' || typeof password !== 'string') throw WRONG();
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, name, mobile, password_hash, mobile_verified, failed_attempts, locked_until
         FROM users WHERE mobile = $1 AND active FOR UPDATE`, [mobile]);
    if (!rows.length) throw WRONG();
    const user = rows[0];

    if (isLocked(user.locked_until)) {
      const until = new Date(user.locked_until);
      throw new AppError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again after ${until.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
    }

    if (!(await verifyPassword(password, user.password_hash))) {
      const next = afterFailure(user.failed_attempts);
      await client.query('UPDATE users SET failed_attempts = $2, locked_until = $3 WHERE id = $1',
        [user.id, next.failedAttempts, next.lockedUntil]);
      return { failed: true };
    }

    await client.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
    return { id: user.id, name: user.name, mobile: user.mobile, mobileVerified: user.mobile_verified };
  }).then((result) => {
    // The failed attempt is committed first, then reported.
    if (result.failed) throw WRONG();
    return result;
  });
}

module.exports = { login };
