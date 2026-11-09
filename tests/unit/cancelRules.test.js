'use strict';
const { parseSlabs, quoteRefund, splitFare } = require('../../src/modules/cancellation/rules');

const slabs = parseSlabs('48:0,12:2500,4:5000');
// A 3A fare of Rs 498.75 (the Rs 513.75 payment less the Rs 15 fee), flat charge Rs 180.
const one3A = (hoursBefore, status = 'CNF') => quoteRefund({
  hoursBefore, slabs, flatPaise: 18000, clerkagePaise: 2000, farePaise: 49875, passengers: [{ seq: 1, status }],
});

describe('cancellation refund slabs (F-015)', () => {
  test('48 hours or more before departure: only the flat charge is kept (boundary)', () => {
    expect(one3A(48).lines[0]).toMatchObject({ deductionPaise: 18000, refundPaise: 31875 });
    expect(one3A(200).refundTotal).toBe(31875);
  });

  test('12 to 48 hours: 25% is kept, but never less than the flat charge', () => {
    // 25% of 49875 is 12469, less than Rs 180, so the flat charge applies
    expect(one3A(47.99).lines[0].deductionPaise).toBe(18000);
    expect(one3A(12).lines[0].deductionPaise).toBe(18000);
  });

  test('4 to 12 hours: 50% is kept (boundary at 12 and 4)', () => {
    expect(one3A(11.99).lines[0]).toMatchObject({ deductionPaise: 24938, refundPaise: 24937 });
    expect(one3A(4).allowed).toBe(true);
  });

  test('under 4 hours cancellation is closed', () => {
    const q = one3A(3.99);
    expect(q.allowed).toBe(false);
    expect(q.cutoffHours).toBe(4);
    expect(q.refundTotal).toBe(0);
  });

  test('a waitlisted passenger only pays the clerkage', () => {
    expect(one3A(30, 'WL').lines[0]).toMatchObject({ deductionPaise: 2000, refundPaise: 47875 });
  });

  test('the charge never exceeds the fare', () => {
    const q = quoteRefund({ hoursBefore: 100, slabs, flatPaise: 18000, clerkagePaise: 2000, farePaise: 10000, passengers: [{ seq: 1, status: 'CNF' }] });
    expect(q.lines[0]).toMatchObject({ deductionPaise: 10000, refundPaise: 0 });
  });

  test('a fare is split across passengers in whole paise', () => {
    expect(splitFare(37000, 3)).toEqual([12334, 12333, 12333]);
    expect(splitFare(37000, 3).reduce((a, b) => a + b, 0)).toBe(37000);
  });

  test('bad slab settings are refused (error case)', () => {
    expect(() => parseSlabs('48:0,12:abc')).toThrow(/slabs/);
    expect(() => parseSlabs('48:12000')).toThrow(/slabs/);
  });
});
