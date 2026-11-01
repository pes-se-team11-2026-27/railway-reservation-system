'use strict';
const { tatkalOpensAt, isTatkalOpen, formatOpening } = require('../../src/modules/allocation/tatkal');

const journey = new Date(2026, 10, 10); // 10 Nov 2026

describe('Tatkal window (F-009)', () => {
  test('opens at the configured time on the day before the journey', () => {
    expect(tatkalOpensAt(journey, '10:00')).toEqual(new Date(2026, 10, 9, 10, 0));
  });

  test('one minute early is closed, exactly on time is open (boundary)', () => {
    expect(isTatkalOpen(journey, '10:00', new Date(2026, 10, 9, 9, 59))).toBe(false);
    expect(isTatkalOpen(journey, '10:00', new Date(2026, 10, 9, 10, 0))).toBe(true);
  });

  test('crosses a month boundary correctly', () => {
    expect(tatkalOpensAt(new Date(2026, 11, 1), '11:00')).toEqual(new Date(2026, 10, 30, 11, 0));
  });

  test('message states the opening time', () => {
    expect(formatOpening(new Date(2026, 10, 9, 10, 0))).toBe('10:00 on 2026-11-09');
  });

  test('a malformed setting is rejected (error case)', () => {
    expect(() => tatkalOpensAt(journey, '25:00')).toThrow(/tatkal_open_time/);
    expect(() => tatkalOpensAt(journey, undefined)).toThrow();
  });
});
