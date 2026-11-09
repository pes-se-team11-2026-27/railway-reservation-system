'use strict';
const { generatePnr } = require('../../src/modules/booking/settle');
const { canView } = require('../../src/modules/booking/checkout');
const { holdRequestProblem } = require('../../src/modules/booking/validation');

describe('PNR and ticket rules (F-012)', () => {
  test('a PNR is 10 digits and never starts with 0', () => {
    for (let i = 0; i < 500; i++) expect(generatePnr()).toMatch(/^[1-9]\d{9}$/);
  });

  test('PNRs are not repeated in a large sample', () => {
    const seen = new Set(Array.from({ length: 2000 }, generatePnr));
    expect(seen.size).toBeGreaterThan(1995);
  });

  const base = { runId: 1, classCode: 'SL', quotaCode: 'GN', passengers: [{ name: 'Asha', age: 30, gender: 'F' }] };

  test('the journey is optional but checked when given', () => {
    expect(holdRequestProblem(base)).toBeNull();
    expect(holdRequestProblem({ ...base, fromStation: 'SBC', toStation: 'MAS' })).toBeNull();
  });

  test('a bad station code is refused (error case)', () => {
    expect(holdRequestProblem({ ...base, fromStation: 'sbc' })).toMatch(/station/);
    expect(holdRequestProblem({ ...base, toStation: 'M4S' })).toMatch(/station/);
  });

  test('a ticket is visible to its passenger and to verified staff only', () => {
    const booking = { userId: 7 };
    expect(canView({ kind: 'PASSENGER', userId: 7 }, booking)).toBe(true);
    expect(canView({ kind: 'PASSENGER', userId: 8 }, booking)).toBe(false);
    expect(canView({ kind: 'STAFF', role: 'TTE', mfaPassed: true }, booking)).toBe(true);
    expect(canView({ kind: 'STAFF', role: 'CLERK', mfaPassed: false }, booking)).toBe(false);
    expect(canView(null, booking)).toBe(false);
  });
});
