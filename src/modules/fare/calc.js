'use strict';

// RRS-F-010: itemised fare. All amounts in paise to avoid rounding errors.
//   base fare per passenger = chargeable km x rate, rounded UP to the next Rs 5
//   chargeable km           = the larger of actual km and the class minimum
//   reservation charge      = per passenger
//   GST                     = on base + reservation, only where the class has it
//   convenience fee         = once per booking
const ROUND_TO = 500;

function computeFare(rule, distanceKm, passengers) {
  if (!Number.isInteger(passengers) || passengers < 1) throw new Error('passengers must be at least 1');
  if (!Number.isInteger(distanceKm) || distanceKm <= 0) throw new Error('distance must be a positive whole number of km');

  const chargeableKm = Math.max(distanceKm, rule.min_km);
  const basePerPassenger = Math.ceil((chargeableKm * rule.paise_per_km) / ROUND_TO) * ROUND_TO;
  const baseFare = basePerPassenger * passengers;
  const reservationCharge = rule.reservation_paise * passengers;
  const gst = Math.round(((baseFare + reservationCharge) * rule.gst_bps) / 10000);
  const convenienceFee = rule.convenience_paise;
  const total = baseFare + reservationCharge + gst + convenienceFee;

  return { distanceKm, chargeableKm, passengers, basePerPassenger, baseFare, reservationCharge, gst, convenienceFee, total };
}

const rupees = (paise) => (paise / 100).toFixed(2);

module.exports = { computeFare, rupees };
