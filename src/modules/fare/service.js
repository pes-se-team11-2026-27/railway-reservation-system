'use strict';
const { pool } = require('../../db/pool');
const { badRequest, notFound } = require('../../errors');
const { computeFare, rupees } = require('./calc');

async function getFareRule(classCode, at = new Date()) {
  const { rows } = await pool.query(
    `SELECT * FROM fare_rules WHERE class_code = $1 AND effective_from <= $2
      ORDER BY effective_from DESC LIMIT 1`, [classCode, at]);
  if (!rows.length) throw notFound('NO_FARE_RULE', `No fare rule for class ${classCode}`);
  return rows[0];
}

// Distance between two stops of a train, origin first.
async function journeyKm(trainNumber, from, to) {
  const { rows } = await pool.query(
    `SELECT b.distance_km - a.distance_km AS km
       FROM trains t
       JOIN train_stops a ON a.train_id = t.id AND a.station_code = $2
       JOIN train_stops b ON b.train_id = t.id AND b.station_code = $3
      WHERE t.number = $1 AND b.seq > a.seq`, [trainNumber, from, to]);
  if (!rows.length) throw badRequest('NOT_ON_ROUTE', 'This train does not run from the origin to the destination');
  return rows[0].km;
}

async function quoteFare({ train, from, to, classCode, passengers }) {
  const count = Number(passengers || 1);
  if (!Number.isInteger(count) || count < 1 || count > 6) throw badRequest('INVALID_PASSENGERS', 'Passengers must be 1 to 6');
  if (!train || !from || !to || !classCode) throw badRequest('MISSING_FIELDS', 'train, from, to and class are required');
  const km = await journeyKm(train, String(from).toUpperCase(), String(to).toUpperCase());
  const rule = await getFareRule(classCode);
  const f = computeFare(rule, km, count);
  return {
    train, from, to, classCode,
    ...f,
    currency: 'INR',
    breakup: [
      { item: `Base fare (${f.chargeableKm} km x ${count})`, amount: rupees(f.baseFare) },
      { item: `Reservation charge (x ${count})`, amount: rupees(f.reservationCharge) },
      { item: 'GST', amount: rupees(f.gst) },
      { item: 'Convenience fee', amount: rupees(f.convenienceFee) },
    ],
    totalRupees: rupees(f.total),
  };
}

module.exports = { quoteFare, getFareRule, journeyKm };
