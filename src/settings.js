'use strict';
const { pool } = require('./db/pool');

// Reads the active value of a policy setting (SAD ADR-02).
async function getSetting(key, at = new Date(), client = pool) {
  const { rows } = await client.query(
    `SELECT value FROM settings
      WHERE key = $1 AND effective_from <= $2
      ORDER BY effective_from DESC LIMIT 1`,
    [key, at],
  );
  return rows.length ? rows[0].value : null;
}

module.exports = { getSetting };
