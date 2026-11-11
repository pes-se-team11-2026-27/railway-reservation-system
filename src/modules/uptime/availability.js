'use strict';

// Availability over a window from per minute samples (RRS-NF-004).
// Pure function: given the minutes that have a healthy sample, it counts the
// minutes in the window, the minutes up, and lists outages (runs of missing
// minutes). Kept separate from the database so it can be tested exactly.
const MINUTE = 60000;
const floorMinute = (t) => Math.floor(t / MINUTE) * MINUTE;

function computeAvailability(sampleTimes, start, end, target = 99.5) {
  const from = floorMinute(start);
  const to = floorMinute(end);
  const up = new Set(sampleTimes.map((t) => floorMinute(new Date(t).getTime())));
  let total = 0;
  let healthy = 0;
  const outages = [];
  let gapStart = null;
  for (let t = from; t < to; t += MINUTE) {
    total += 1;
    if (up.has(t)) {
      healthy += 1;
      if (gapStart !== null) { outages.push({ from: new Date(gapStart), to: new Date(t), minutes: (t - gapStart) / MINUTE }); gapStart = null; }
    } else if (gapStart === null) {
      gapStart = t;
    }
  }
  if (gapStart !== null) outages.push({ from: new Date(gapStart), to: new Date(to), minutes: (to - gapStart) / MINUTE });
  const percent = total ? (healthy * 100) / total : 100;
  return { minutes: total, upMinutes: healthy, percent: Math.round(percent * 1000) / 1000, target, met: percent >= target, outages };
}

module.exports = { computeAvailability, floorMinute };
