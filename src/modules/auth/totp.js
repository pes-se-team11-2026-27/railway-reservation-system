'use strict';
const crypto = require('crypto');

// Time based one time passwords (RFC 6238), the codes shown by apps such as
// Google Authenticator. Used as the staff second factor (RRS-SR-003).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = '';
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('Invalid base32 secret');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(key, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(bin).padStart(digits, '0');
}

function totp(secretBase32, timeMs = Date.now(), { step = 30, digits = 6 } = {}) {
  return hotp(base32Decode(secretBase32), Math.floor(timeMs / 1000 / step), digits);
}

// Accepts the current code and one step either side, for small clock drift.
function verifyTotp(secretBase32, code, timeMs = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secretBase32);
  const counter = Math.floor(timeMs / 1000 / 30);
  for (const c of [counter - 1, counter, counter + 1]) {
    const expected = hotp(key, c);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return true;
  }
  return false;
}

module.exports = { base32Decode, hotp, totp, verifyTotp };
