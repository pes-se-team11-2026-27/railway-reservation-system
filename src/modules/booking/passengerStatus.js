'use strict';

// Bug #67: when a booking is cancelled, its passenger rows keep the status and
// berth they had (the berth itself goes back to the pool and can be rebooked).
// Every view that reads those rows must therefore look at the booking status
// first and show a cancelled booking's passengers as CANCELLED with no berth.
// One function, so the chart, the public PNR status and the ticket agree.
function maskIfCancelled(bookingStatus, passenger) {
  if (bookingStatus !== 'CANCELLED') return passenger;
  const out = { ...passenger, status: 'CANCELLED' };
  for (const key of ['position', 'berth', 'coach', 'berthId']) {
    if (key in out) out[key] = null;
  }
  return out;
}

module.exports = { maskIfCancelled };
