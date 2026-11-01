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
};

module.exports = { config, int };
