'use strict';
const { maskIfCancelled } = require('../../src/modules/booking/passengerStatus');

describe('maskIfCancelled (bug #67)', () => {
  const confirmed = { seq: 1, status: 'CNF', position: null, berth: 'C1/4', coach: 'C1', berthId: 9, name: 'A' };

  test('a cancelled booking shows its passengers as CANCELLED with no berth', () => {
    expect(maskIfCancelled('CANCELLED', confirmed)).toEqual({ seq: 1, status: 'CANCELLED', position: null, berth: null, coach: null, berthId: null, name: 'A' });
  });

  test('a waitlisted or RAC passenger of a cancelled booking loses the queue position too', () => {
    const out = maskIfCancelled('CANCELLED', { status: 'RAC', position: 2, berth: null });
    expect(out).toEqual({ status: 'CANCELLED', position: null, berth: null });
  });

  test('a confirmed booking is returned unchanged', () => {
    expect(maskIfCancelled('CONFIRMED', confirmed)).toBe(confirmed);
  });

  test('only keys the passenger already has are touched, and the input is not modified', () => {
    const input = { status: 'CNF', berth: 'C1/4' };
    const out = maskIfCancelled('CANCELLED', input);
    expect(Object.keys(out).sort()).toEqual(['berth', 'status']);
    expect(input).toEqual({ status: 'CNF', berth: 'C1/4' });
  });
});
