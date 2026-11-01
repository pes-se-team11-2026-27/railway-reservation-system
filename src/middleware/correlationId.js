'use strict';
const crypto = require('crypto');

// Every request carries a correlation id (SRS 3.4), reused if the caller sent one.
function correlationId(req, res, next) {
  const incoming = req.get('x-correlation-id');
  req.correlationId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.set('x-correlation-id', req.correlationId);
  next();
}

module.exports = correlationId;
