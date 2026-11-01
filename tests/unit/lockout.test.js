'use strict';
const { afterFailure, isLocked } = require('../../src/modules/auth/lockout');

const now = new Date(2026, 10, 2, 10, 0);

describe('sign in lockout rule (SR-005)', () => {
  test('first four failures only count up', () => {
    expect(afterFailure(0, now)).toEqual({ failedAttempts: 1, lockedUntil: null });
    expect(afterFailure(3, now)).toEqual({ failedAttempts: 4, lockedUntil: null });
  });

  test('the fifth failure locks for 15 minutes and resets the count (boundary)', () => {
    const r = afterFailure(4, now);
    expect(r.failedAttempts).toBe(0);
    expect(r.lockedUntil).toEqual(new Date(2026, 10, 2, 10, 15));
  });

  test('locked until the time passes', () => {
    const until = new Date(2026, 10, 2, 10, 15);
    expect(isLocked(until, new Date(2026, 10, 2, 10, 14))).toBe(true);
    expect(isLocked(until, new Date(2026, 10, 2, 10, 15))).toBe(false);
  });

  test('no lock time means not locked', () => {
    expect(isLocked(null, now)).toBe(false);
  });
});
