'use strict';
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

// scrypt is a memory hard hash (SRS RRS-SR-005). Parameters are stored with
// the hash so they can be raised later without breaking old accounts.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;

async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(plain, salt, KEY_LEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(plain, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  if (expected.length === 0) return false;
  let actual;
  try {
    actual = await scrypt(plain, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p),
    });
  } catch {
    return false;
  }
  return crypto.timingSafeEqual(actual, expected);
}

// Returns null if the password is acceptable, otherwise the reason.
function passwordProblem(plain) {
  if (typeof plain !== 'string') return 'Password is required';
  if (plain.length < 8) return 'Password must be at least 8 characters';
  if (plain.length > 128) return 'Password must be at most 128 characters';
  if (!/[A-Za-z]/.test(plain) || !/\d/.test(plain)) return 'Password must contain a letter and a digit';
  return null;
}

module.exports = { hashPassword, verifyPassword, passwordProblem };
