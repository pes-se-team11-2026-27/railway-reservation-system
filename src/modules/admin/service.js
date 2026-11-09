'use strict';
const { pool, withTransaction } = require('../../db/pool');
const { getSetting } = require('../../settings');
const { badRequest, conflict } = require('../../errors');
const audit = require('../audit/service');

// RRS-F-019: fare and quota rules change through data with an effective
// date, never through a code release (SAD ADR-02). Every change is written
// to the audit log in the same transaction (RRS-F-020).

const INT = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

function effectiveDate(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) throw badRequest('INVALID_DATE', 'effectiveFrom must be a date and time');
  // A rule may start now or later, never in the past: past bookings were
  // priced under the rules in force at the time and must stay that way.
  if (d.getTime() < Date.now() - 60000) throw badRequest('BACKDATED', 'A rule cannot start in the past');
  return d;
}

async function listFareRules() {
  const { rows } = await pool.query(
    `SELECT f.*, f.effective_from <= now() AS started,
            f.effective_from = (SELECT max(g.effective_from) FROM fare_rules g
                                 WHERE g.class_code = f.class_code AND g.effective_from <= now()) AS current
       FROM fare_rules f ORDER BY f.class_code, f.effective_from DESC`);
  return rows.map((r) => ({
    classCode: r.class_code, paisePerKm: r.paise_per_km, minKm: r.min_km, reservationPaise: r.reservation_paise,
    gstBps: r.gst_bps, conveniencePaise: r.convenience_paise, effectiveFrom: r.effective_from,
    state: r.current ? 'CURRENT' : (r.started ? 'PAST' : 'SCHEDULED'),
  }));
}

async function addFareRule(input = {}, actor) {
  const { classCode, paisePerKm, minKm, reservationPaise, gstBps, conveniencePaise } = input;
  const cls = await pool.query('SELECT code FROM travel_classes WHERE code = $1', [classCode]);
  if (!cls.rows.length) throw badRequest('INVALID_CLASS', 'Unknown class');
  if (!INT(paisePerKm, 1, 10000)) throw badRequest('INVALID_RATE', 'Rate must be 1 to 10000 paise per km');
  if (!INT(minKm, 0, 2000)) throw badRequest('INVALID_MIN_KM', 'Minimum distance must be 0 to 2000 km');
  if (!INT(reservationPaise, 0, 100000)) throw badRequest('INVALID_RESERVATION', 'Reservation charge must be 0 to 100000 paise');
  if (!INT(gstBps, 0, 2800)) throw badRequest('INVALID_GST', 'GST must be 0 to 2800 basis points (28%)');
  if (!INT(conveniencePaise, 0, 100000)) throw badRequest('INVALID_FEE', 'Convenience fee must be 0 to 100000 paise');
  const from = effectiveDate(input.effectiveFrom);

  return withTransaction(async (client) => {
    const before = await client.query(
      `SELECT paise_per_km, min_km, reservation_paise, gst_bps, convenience_paise FROM fare_rules
        WHERE class_code = $1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1`, [classCode, from]);
    try {
      await client.query(
        `INSERT INTO fare_rules (class_code, paise_per_km, min_km, reservation_paise, gst_bps, convenience_paise, effective_from)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [classCode, paisePerKm, minKm, reservationPaise, gstBps, conveniencePaise, from]);
    } catch (err) {
      if (err.code === '23505') throw conflict('RULE_EXISTS', 'A rule for this class already starts at that time');
      throw err;
    }
    const after = { paise_per_km: paisePerKm, min_km: minKm, reservation_paise: reservationPaise, gst_bps: gstBps, convenience_paise: conveniencePaise };
    await audit.record({
      actor, action: 'FARE_CHANGE', target: `fare rule ${classCode}`,
      details: { effectiveFrom: from.toISOString(), before: before.rows[0] || null, after },
    }, client);
    return { classCode, effectiveFrom: from, ...after };
  });
}

// Quota rules: the Tatkal opening time and the passenger limits per booking.
const QUOTA_RULES = {
  tatkal_open_time: { label: 'Tatkal opening time (day before travel)', check: (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v), hint: 'HH:MM, 24 hour' },
  max_passengers_general: { label: 'Most passengers per general booking', check: (v) => /^\d+$/.test(v) && INT(Number(v), 1, 6), hint: '1 to 6' },
  max_passengers_tatkal: { label: 'Most passengers per Tatkal booking', check: (v) => /^\d+$/.test(v) && INT(Number(v), 1, 4), hint: '1 to 4' },
};

async function listQuotaRules() {
  const out = [];
  for (const [key, rule] of Object.entries(QUOTA_RULES)) {
    const scheduled = await pool.query(
      `SELECT value, effective_from FROM settings WHERE key = $1 AND effective_from > now() ORDER BY effective_from`, [key]);
    out.push({
      key, label: rule.label, hint: rule.hint, current: await getSetting(key),
      scheduled: scheduled.rows.map((r) => ({ value: r.value, effectiveFrom: r.effective_from })),
    });
  }
  return out;
}

async function addQuotaRule(input = {}, actor) {
  const rule = QUOTA_RULES[input.key];
  if (!rule) throw badRequest('INVALID_RULE', `Rule must be one of ${Object.keys(QUOTA_RULES).join(', ')}`);
  const value = String(input.value == null ? '' : input.value).trim();
  if (!rule.check(value)) throw badRequest('INVALID_VALUE', `${rule.label}: ${rule.hint}`);
  const from = effectiveDate(input.effectiveFrom);
  return withTransaction(async (client) => {
    const before = await getSetting(input.key, from, client);
    try {
      await client.query('INSERT INTO settings (key, value, effective_from) VALUES ($1, $2, $3)', [input.key, value, from]);
    } catch (err) {
      if (err.code === '23505') throw conflict('RULE_EXISTS', 'A change to this rule already starts at that time');
      throw err;
    }
    await audit.record({
      actor, action: 'QUOTA_CHANGE', target: input.key,
      details: { effectiveFrom: from.toISOString(), before, after: value },
    }, client);
    return { key: input.key, value, effectiveFrom: from };
  });
}

module.exports = { listFareRules, addFareRule, listQuotaRules, addQuotaRule, QUOTA_RULES };
