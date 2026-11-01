'use strict';
const { computeFare, rupees } = require('../../src/modules/fare/calc');

const SL = { paise_per_km: 45, min_km: 200, reservation_paise: 2000, gst_bps: 0, convenience_paise: 1500 };
const AC3 = { paise_per_km: 120, min_km: 300, reservation_paise: 4000, gst_bps: 500, convenience_paise: 1500 };

describe('fare calculation (F-010)', () => {
  test('Bengaluru to Chennai, SL, 1 passenger = Rs 200', () => {
    const f = computeFare(SL, 362, 1);
    expect(f).toMatchObject({ basePerPassenger: 16500, reservationCharge: 2000, gst: 0, convenienceFee: 1500, total: 20000 });
  });

  test('Bengaluru to Chennai, 3A, 1 passenger = Rs 513.75 with 5% GST', () => {
    const f = computeFare(AC3, 362, 1);
    expect(f).toMatchObject({ baseFare: 43500, reservationCharge: 4000, gst: 2375, total: 51375 });
    expect(rupees(f.total)).toBe('513.75');
  });

  test('Katpadi to Chennai, SL, 142 km is charged as 200 km = Rs 125', () => {
    const f = computeFare(SL, 142, 1);
    expect(f.chargeableKm).toBe(200);
    expect(f.total).toBe(12500);
  });

  test('minimum distance boundary: 199 and 200 km cost the same, 201 km is charged as 201', () => {
    expect(computeFare(SL, 199, 1).chargeableKm).toBe(200);
    expect(computeFare(SL, 200, 1).total).toBe(computeFare(SL, 199, 1).total);
    expect(computeFare(SL, 201, 1).chargeableKm).toBe(201);
  });

  test('base fare rounds up to the next Rs 5, not down', () => {
    // 201 km x 45 paise = 9045 paise, rounds up to 9500
    expect(computeFare(SL, 201, 1).basePerPassenger).toBe(9500);
  });

  test('total equals the sum of the parts, and the fee is charged once per booking', () => {
    const f = computeFare(AC3, 362, 3);
    expect(f.total).toBe(f.baseFare + f.reservationCharge + f.gst + f.convenienceFee);
    expect(f.baseFare).toBe(3 * 43500);
    expect(f.convenienceFee).toBe(1500);
  });

  test('zero passengers or zero distance is rejected (error case)', () => {
    expect(() => computeFare(SL, 362, 0)).toThrow(/passengers/);
    expect(() => computeFare(SL, 0, 1)).toThrow(/distance/);
  });
});
