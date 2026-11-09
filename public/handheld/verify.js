/* Ticket check against a downloaded chart (RRS-F-018). Runs on the handheld
   with no network, and in the tests: the same code decides in both places. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RRSVerify = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The ticket QR says "RRS:PNR=1234567890"; a PNR can also be typed in.
  function readPnr(text) {
    var t = String(text || '').trim();
    var m = /^RRS:PNR=([1-9]\d{9})$/.exec(t) || /^([1-9]\d{9})$/.exec(t);
    return m ? m[1] : null;
  }

  // Returns { valid, code, message, booking } for a scanned or typed ticket.
  function verifyTicket(chart, text) {
    var pnr = readPnr(text);
    if (!pnr) return { valid: false, code: 'UNREADABLE', message: 'Not a ticket code. Scan the QR again or type the 10 digit PNR.' };
    if (!chart || !chart.bookings) return { valid: false, code: 'NO_CHART', message: 'No chart on this device. Download the chart first.' };
    var booking = null;
    for (var i = 0; i < chart.bookings.length; i++) if (chart.bookings[i].pnr === pnr) booking = chart.bookings[i];
    if (!booking) {
      return { valid: false, code: 'NOT_ON_THIS_TRAIN', pnr: pnr,
        message: 'PNR ' + pnr + ' is not on the chart of ' + chart.train.number + ' on ' + chart.runDate + '. It is for another train or date.' };
    }
    if (booking.status === 'CANCELLED') {
      return { valid: false, code: 'CANCELLED', pnr: pnr, booking: booking, message: 'PNR ' + pnr + ' was cancelled. Not valid for travel.' };
    }
    var travelling = booking.passengers.filter(function (p) { return p.status !== 'NOT_ON_CHART'; });
    if (!travelling.length) {
      return { valid: false, code: 'NOT_ON_CHART', pnr: pnr, booking: booking, message: 'PNR ' + pnr + ' stayed on the waitlist and was refunded. Not valid for travel.' };
    }
    return { valid: true, code: 'VALID', pnr: pnr, booking: booking, passengers: travelling, message: 'Valid ticket.' };
  }

  return { readPnr: readPnr, verifyTicket: verifyTicket };
}));
