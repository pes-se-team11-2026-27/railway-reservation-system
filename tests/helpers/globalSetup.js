'use strict';
// Runs once before the integration suite: fresh schema, then seed data.
module.exports = async () => {
  process.env.NODE_ENV = 'test';
  const { pool, withTransaction } = require('../../src/db/pool');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const { migrate } = require('../../src/db/migrate');
  await migrate();
  const { seed } = require('../../db/seed/seed');
  await withTransaction(seed);
  await pool.end();
};
