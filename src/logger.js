'use strict';
const pino = require('pino');
const { config } = require('./config');

// Structured JSON logs. No passenger data goes in here (SAD 4.4).
const logger = pino({
  level: config.env === 'test' ? 'silent' : config.logLevel,
});

module.exports = logger;
