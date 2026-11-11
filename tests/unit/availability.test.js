'use strict';
const { computeAvailability } = require('../../src/modules/uptime/availability');

const T0 = Date.UTC(2026, 10, 1, 0, 0);
const minute = (n) => new Date(T0 + n * 60000);
const minutes = (from, to) => Array.from({ length: to - from }, (_, i) => minute(from + i));

describe('availability from minute samples (NF-004)', () => {
  test('every minute sampled is 100 percent', () => {
    const r = computeAvailability(minutes(0, 1000), minute(0), minute(1000));
    expect(r).toMatchObject({ minutes: 1000, upMinutes: 1000, percent: 100, met: true, outages: [] });
  });

  test('99.5 percent exactly meets the target; one minute less does not (boundary)', () => {
    const at = computeAvailability([...minutes(0, 995)], minute(0), minute(1000));
    expect(at).toMatchObject({ percent: 99.5, met: true });
    const below = computeAvailability([...minutes(0, 994)], minute(0), minute(1000));
    expect(below.met).toBe(false);
  });

  test('missing minutes are reported as outages with their length', () => {
    const samples = [...minutes(0, 100), ...minutes(110, 200), ...minutes(203, 300)];
    const r = computeAvailability(samples, minute(0), minute(300));
    expect(r.outages.map((o) => o.minutes)).toEqual([10, 3]);
    expect(r.outages[0].from).toEqual(minute(100));
    expect(r.upMinutes).toBe(287);
  });

  test('an outage still running at the end of the window is reported', () => {
    const r = computeAvailability(minutes(0, 50), minute(0), minute(60));
    expect(r.outages).toEqual([{ from: minute(50), to: minute(60), minutes: 10 }]);
  });

  test('samples outside the window are ignored, and seconds within a minute count as that minute', () => {
    const samples = [minute(-5), new Date(T0 + 30000), minute(1)];
    const r = computeAvailability(samples, minute(0), minute(2));
    expect(r).toMatchObject({ minutes: 2, upMinutes: 2 });
  });
});
