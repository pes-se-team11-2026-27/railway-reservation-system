'use strict';
const { pool } = require('../../db/pool');
const { badRequest } = require('../../errors');

const ACTIONS = ['FARE_CHANGE', 'QUOTA_CHANGE', 'MANUAL_REFUND', 'CHART_EDIT', 'CLERK_OVERRIDE'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// RRS-F-020: records one privileged action. Pass the caller's transaction
// client so the log entry commits or rolls back together with the action.
async function record({ actor, action, target, details = {}, correlationId = null }, client = pool) {
  if (typeof actor !== 'string' || !actor.trim()) throw badRequest('INVALID_ACTOR', 'actor is required');
  if (!ACTIONS.includes(action)) throw badRequest('INVALID_ACTION', `action must be one of ${ACTIONS.join(', ')}`);
  if (typeof target !== 'string' || !target.trim()) throw badRequest('INVALID_TARGET', 'target is required');
  const { rows } = await client.query(
    `INSERT INTO audit_log (actor, action, target, details, correlation_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, at`,
    [actor.trim(), action, target.trim(), JSON.stringify(details), correlationId]);
  return { id: Number(rows[0].id), at: rows[0].at };
}

// Filter by actor, action and a date range (inclusive, YYYY-MM-DD), newest first.
async function list({ actor, action, from, to, limit } = {}) {
  const where = [];
  const args = [];
  if (actor) { args.push(actor); where.push(`actor = $${args.length}`); }
  if (action) {
    if (!ACTIONS.includes(action)) throw badRequest('INVALID_ACTION', 'Unknown action');
    args.push(action); where.push(`action = $${args.length}`);
  }
  if (from) {
    if (!DATE.test(from)) throw badRequest('INVALID_DATE', 'from must be YYYY-MM-DD');
    args.push(from); where.push(`at >= $${args.length}::date`);
  }
  if (to) {
    if (!DATE.test(to)) throw badRequest('INVALID_DATE', 'to must be YYYY-MM-DD');
    args.push(to); where.push(`at < $${args.length}::date + 1`);
  }
  const n = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const { rows } = await pool.query(
    `SELECT id, at, actor, action, target, details, correlation_id FROM audit_log
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY at DESC, id DESC LIMIT ${n}`, args);
  return rows.map((r) => ({
    id: Number(r.id), at: r.at, actor: r.actor, action: r.action, target: r.target,
    details: r.details, correlationId: r.correlation_id,
  }));
}

module.exports = { record, list, ACTIONS };
