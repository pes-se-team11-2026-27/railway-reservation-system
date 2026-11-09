'use strict';
require('dotenv').config();

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/rrs',
  logLevel: process.env.LOG_LEVEL || 'info',
  // Shared secret the payment gateway signs its callbacks with (RRS-F-011).
  gatewaySecret: process.env.GATEWAY_SECRET || 'dev-only-gateway-secret',
};

module.exports = { config, int };
