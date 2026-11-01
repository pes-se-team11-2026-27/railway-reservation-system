'use strict';
const { Pool } = require('pg');
const { config } = require('../config');

const pool = new Pool({ connectionString: config.databaseUrl, max: 20 });

// Runs fn inside one transaction. Every module that changes inventory uses this.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
