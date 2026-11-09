'use strict';
const crypto = require('crypto');
const { config } = require('../../config');

// The gateway signs the fields it reports, in a fixed order, with HMAC-SHA256.
// Building the same string on our side means a reordered or extra JSON field
// cannot change what is verified.
function canonical({ txRef, status, token }) {
  return [txRef, status, token || ''].join('|');
}

function sign(fields, secret = config.gatewaySecret) {
  return crypto.createHmac('sha256', secret).update(canonical(fields)).digest('hex');
}

function verify(fields, signature, secret = config.gatewaySecret) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(sign(fields, secret), 'hex');
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

module.exports = { canonical, sign, verify };
