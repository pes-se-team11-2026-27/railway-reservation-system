'use strict';

// RRS-F-015 refund slabs, as a pure function so every boundary can be tested.
// Slabs come from settings as "hours:deduction" pairs in basis points, for
// example "48:0,12:2500,4:5000":
//   48 hours or more before departure: only the flat charge is kept
//   12 to 48 hours: 25% of the fare is kept (at least the flat charge)
//   4 to 12 hours: 50% is kept (at least the flat charge)
//   under 4 hours: cancellation is closed (the chart is being prepared)
// A waitlisted passenger never travelled on a berth, so only the small
// clerkage charge is kept. The convenience fee is never refunded.

function parseSlabs(text) {
  const slabs = String(text || '').split(',').map((part) => {
    const [h, bps] = part.split(':').map((x) => Number(x.trim()));
    return { hours: h, bps };
  });
  if (!slabs.length || slabs.some((s) => !Number.isFinite(s.hours) || !Number.isInteger(s.bps) || s.bps < 0 || s.bps > 10000)) {
    throw new Error(`Bad cancellation slabs: ${text}`);
  }
  return slabs.sort((a, b) => b.hours - a.hours);
}

const cutoffHours = (slabs) => slabs[slabs.length - 1].hours;

// Splits the fare across passengers in whole paise; the first absorbs the remainder.
function splitFare(totalPaise, count) {
  const each = Math.floor(totalPaise / count);
  return Array.from({ length: count }, (_, i) => (i === 0 ? totalPaise - each * (count - 1) : each));
}

function quoteRefund({ hoursBefore, slabs, flatPaise, clerkagePaise, farePaise, passengers }) {
  const cutoff = cutoffHours(slabs);
  if (hoursBefore < cutoff) return { allowed: false, cutoffHours: cutoff, lines: [], refundTotal: 0 };
  const slab = slabs.find((s) => hoursBefore >= s.hours);
  const shares = splitFare(farePaise, passengers.length);
  const lines = passengers.map((p, i) => {
    const fare = shares[i];
    const kept = p.status === 'WL'
      ? Math.min(clerkagePaise, fare)
      : Math.min(fare, Math.max(flatPaise, Math.round((fare * slab.bps) / 10000)));
    return { seq: p.seq, status: p.status, farePaise: fare, deductionPaise: kept, refundPaise: fare - kept };
  });
  return { allowed: true, cutoffHours: cutoff, slab, lines, refundTotal: lines.reduce((s, l) => s + l.refundPaise, 0) };
}

module.exports = { parseSlabs, cutoffHours, splitFare, quoteRefund };
