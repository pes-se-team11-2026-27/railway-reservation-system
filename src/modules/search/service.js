'use strict';
const { pool } = require('../../db/pool');
const { badRequest } = require('../../errors');

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function checkSearchInput({ from, to, date }) {
  if (!from || !to) throw badRequest('STATION_REQUIRED', 'Both origin and destination are required');
  if (from === to) throw badRequest('SAME_STATION', 'Origin and destination must be different');
  if (!DATE.test(date || '') || Number.isNaN(Date.parse(date))) {
    throw badRequest('INVALID_DATE', 'Date must be in YYYY-MM-DD format');
  }
  if (date < todayLocal()) throw badRequest('PAST_DATE', 'Journey date cannot be in the past');
}

// RRS-F-003: trains that stop at both stations, in that order, and run on the date.
async function searchTrains(input) {
  const from = String(input.from || '').toUpperCase();
  const to = String(input.to || '').toUpperCase();
  const { date } = input;
  checkSearchInput({ from, to, date });

  const known = await pool.query('SELECT code FROM stations WHERE code = ANY($1)', [[from, to]]);
  if (known.rowCount < 2) throw badRequest('UNKNOWN_STATION', 'Unknown station code');

  const { rows } = await pool.query(
    `SELECT t.number, t.name, r.id AS run_id,
            to_char(a.departs, 'HH24:MI') AS departs,
            to_char(b.arrives, 'HH24:MI') AS arrives,
            b.day_offset - a.day_offset AS arrival_day,
            b.distance_km - a.distance_km AS distance_km,
            ARRAY(SELECT DISTINCT c.class_code FROM coaches c WHERE c.train_id = t.id ORDER BY 1) AS classes
       FROM trains t
       JOIN train_stops a ON a.train_id = t.id AND a.station_code = $1
       JOIN train_stops b ON b.train_id = t.id AND b.station_code = $2 AND b.seq > a.seq
       JOIN train_runs r ON r.train_id = t.id AND r.run_date = $3::date - a.day_offset
      ORDER BY a.departs`,
    [from, to, date],
  );
  return rows.map((r) => ({
    number: r.number,
    name: r.name,
    runId: r.run_id,
    departs: r.departs,
    arrives: r.arrives,
    arrivalDay: r.arrival_day,
    distanceKm: r.distance_km,
    classes: r.classes,
  }));
}

async function listStations() {
  const { rows } = await pool.query('SELECT code, name FROM stations ORDER BY name');
  return rows;
}

module.exports = { searchTrains, listStations, checkSearchInput };
