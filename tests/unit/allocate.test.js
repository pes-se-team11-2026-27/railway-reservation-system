'use strict';
const { assignStatuses } = require('../../src/modules/allocation/allocate');

const berths = (n) => Array.from({ length: n }, (_, i) => ({ berthId: 100 + i }));
const base = { racCapacity: 2, racTaken: 0, lastRac: 0, lastWl: 0 };

describe('allocation order (F-007)', () => {
  test('all passengers confirmed when enough berths are free', () => {
    const r = assignStatuses({ ...base, passengerCount: 3, freeBerths: berths(3) });
    expect(r.map((x) => x.status)).toEqual(['CNF', 'CNF', 'CNF']);
    expect(r.map((x) => x.berthId)).toEqual([100, 101, 102]);
  });

  test('overflow goes to RAC, then waitlist, in passenger order', () => {
    const r = assignStatuses({ ...base, passengerCount: 5, freeBerths: berths(1) });
    expect(r.map((x) => `${x.status}${x.position || ''}`)).toEqual(['CNF', 'RAC1', 'RAC2', 'WL1', 'WL2']);
  });

  test('exactly enough berths leaves RAC untouched (boundary)', () => {
    const r = assignStatuses({ ...base, passengerCount: 2, freeBerths: berths(2) });
    expect(r.every((x) => x.status === 'CNF')).toBe(true);
  });

  test('numbers continue after positions already taken', () => {
    const r = assignStatuses({ racCapacity: 2, racTaken: 1, lastRac: 1, lastWl: 4, passengerCount: 2, freeBerths: [] });
    expect(r.map((x) => `${x.status}${x.position}`)).toEqual(['RAC2', 'WL5']);
  });

  test('no RAC capacity sends everyone to the waitlist', () => {
    const r = assignStatuses({ racCapacity: 0, racTaken: 0, lastRac: 0, lastWl: 0, passengerCount: 2, freeBerths: [] });
    expect(r.map((x) => x.status)).toEqual(['WL', 'WL']);
  });

  test('more RAC taken than capacity never gives a negative count (error case)', () => {
    const r = assignStatuses({ racCapacity: 2, racTaken: 3, lastRac: 3, lastWl: 0, passengerCount: 1, freeBerths: [] });
    expect(r[0]).toEqual({ status: 'WL', berthId: null, position: 1 });
  });
});
