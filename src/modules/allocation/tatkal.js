'use strict';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

// RRS-F-009: Tatkal opens at the configured time on the day before the
// journey. runDate is the journey date as a Date at local midnight.
function tatkalOpensAt(runDate, openTime) {
  const m = TIME.exec(openTime || '');
  if (!m) throw new Error(`Bad tatkal_open_time setting: ${openTime}`);
  return new Date(runDate.getFullYear(), runDate.getMonth(), runDate.getDate() - 1, Number(m[1]), Number(m[2]));
}

function isTatkalOpen(runDate, openTime, now = new Date()) {
  return now >= tatkalOpensAt(runDate, openTime);
}

function formatOpening(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())} on ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

module.exports = { tatkalOpensAt, isTatkalOpen, formatOpening };
