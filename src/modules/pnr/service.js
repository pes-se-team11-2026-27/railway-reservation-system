'use strict';
const { pool } = require('../../db/pool');
const { badRequest, notFound } = require('../../errors');
const { maskIfCancelled } = require('../booking/passengerStatus');

// "Meera Rao" becomes "M. R." Only initials leave the system (RRS-SR-004).
function initials(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ');
}

// Public PNR status: enough for a relative at the station to know the
// journey and berth status, nothing that identifies or profiles a passenger:
// no names, ages, genders, phone, email or amount paid.
async function publicStatus(pnr) {
  if (!/^[1-9]\d{9}$/.test(String(pnr || ''))) throw badRequest('INVALID_PNR', 'A PNR is 10 digits');
  const b = await pool.query(
    `SELECT b.pnr, b.status, h.id AS hold_id, h.class_code, h.from_station, h.to_station,
            to_char(r.run_date, 'YYYY-MM-DD') AS run_date, t.number, t.name
       FROM bookings b JOIN holds h ON h.id = b.hold_id
       JOIN train_runs r ON r.id = h.run_id JOIN trains t ON t.id = r.train_id
      WHERE b.pnr = $1`, [pnr]);
  if (!b.rows.length) throw notFound('PNR_NOT_FOUND', 'No booking with that PNR');
  const bk = b.rows[0];
  const pax = await pool.query(
    `SELECT p.seq, p.name, p.status, p.position, c.coach_no, br.berth_no
       FROM hold_passengers p
       LEFT JOIN berths br ON br.id = p.berth_id LEFT JOIN coaches c ON c.id = br.coach_id
      WHERE p.hold_id = $1 ORDER BY p.seq`, [bk.hold_id]);
  return {
    pnr: bk.pnr,
    bookingStatus: bk.status,
    train: { number: bk.number, name: bk.name },
    journeyDate: bk.run_date,
    classCode: bk.class_code,
    from: bk.from_station,
    to: bk.to_station,
    passengers: pax.rows.map((p) => maskIfCancelled(bk.status, {
      passenger: p.seq,
      initials: initials(p.name),
      status: p.status === 'CNF' ? 'CNF' : `${p.status} ${p.position}`,
      berth: p.coach_no ? `${p.coach_no}/${p.berth_no}` : null,
    })),
  };
}

module.exports = { publicStatus, initials };
