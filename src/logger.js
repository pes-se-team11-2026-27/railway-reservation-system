'use strict';
const pino = require('pino');
const { config } = require('./config');

// Structured JSON logs. No passenger data goes in here (SAD 4.4), and as a
// second line of defence anything shaped like card data or a secret is
// replaced before it is written (RRS-NF-005, RRS-SR-002).
const REDACT = [
  '*.cardNumber', '*.card_number', '*.cardNo', '*.pan', '*.cvv', '*.cvc', '*.securityCode', '*.expiry',
  '*.password', '*.token', 'req.headers.cookie', 'req.headers.authorization',
];

const options = {
  level: config.env === 'test' ? 'silent' : config.logLevel,
  redact: { paths: REDACT, censor: '[REDACTED]' },
};

const logger = pino(options);
logger.options = options;

module.exports = logger;
