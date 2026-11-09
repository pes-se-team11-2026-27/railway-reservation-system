'use strict';
const crypto = require('crypto');
const { pool } = require('../../db/pool');
const logger = require('../../logger');

const MAX_ATTEMPTS = 5;

// Development provider: records the message as delivered and returns a
// message reference, as a real SMS or email provider would (SRS 3.3).
let provider = {
  async send({ channel, recipient }) {
    logger.info({ channel, to: channel === 'SMS' ? recipient.slice(-4) : 'email' }, 'Notification delivered (development provider)');
    return 'MSG-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  },
};

function setProvider(p) { provider = p; }

// Writes a message into the outbox inside the caller's transaction (ADR-03).
async function queue(client, { bookingId = null, kind, channel, recipient, body }) {
  await client.query(
    'INSERT INTO notifications (booking_id, kind, channel, recipient, body) VALUES ($1, $2, $3, $4, $5)',
    [bookingId, kind, channel, recipient, body]);
}

// Sends what is waiting. Rows are claimed with SKIP LOCKED so two senders
// never send the same message; a failure is counted and retried next time.
async function dispatchPending(limit = 50) {
  const client = await pool.connect();
  let sent = 0;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM notifications WHERE sent_at IS NULL AND attempts < $1
        ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`, [MAX_ATTEMPTS, limit]);
    for (const n of rows) {
      try {
        const reference = await provider.send(n);
        await client.query('UPDATE notifications SET sent_at = now(), attempts = attempts + 1, reference = $2, last_error = NULL WHERE id = $1', [n.id, reference]);
        sent += 1;
      } catch (err) {
        await client.query('UPDATE notifications SET attempts = attempts + 1, last_error = $2 WHERE id = $1', [n.id, String(err.message).slice(0, 200)]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return sent;
}

module.exports = { queue, dispatchPending, setProvider, MAX_ATTEMPTS };
