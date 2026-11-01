'use strict';
// Shared helpers for integration tests. Each test file should use its own
// train and date so files do not disturb each other's data.
const { pool } = require('../../src/db/pool');

// Returns the run id for a train number, daysAhead days from today.
async function getRunId(trainNumber, daysAhead) {
  const { rows } = await pool.query(
    `SELECT r.id FROM train_runs r JOIN trains t ON t.id = r.train_id
      WHERE t.number = $1 AND r.run_date = current_date + $2::int`,
    [trainNumber, daysAhead],
  );
  if (!rows.length) throw new Error(`No run for train ${trainNumber} on day +${daysAhead}`);
  return rows[0].id;
}

// Formats a date daysAhead from today as YYYY-MM-DD in local time.
function dateAhead(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = { getRunId, dateAhead };
