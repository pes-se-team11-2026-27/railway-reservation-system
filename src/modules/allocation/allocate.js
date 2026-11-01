'use strict';

// RRS-F-007: passengers take free berths of the requested quota first, then
// RAC positions, then the waitlist, in the order they are listed.
// Pure function, so the rule can be tested without a database.
//   freeBerths  berths already locked for this request, in order
//   racCapacity RAC positions for the class on this run
//   racTaken    RAC positions held by active holds
//   lastRac     highest RAC number in use, lastWl highest waitlist number
function assignStatuses({ passengerCount, freeBerths, racCapacity, racTaken, lastRac, lastWl }) {
  const result = [];
  let racLeft = Math.max(0, racCapacity - racTaken);
  let rac = lastRac;
  let wl = lastWl;
  for (let i = 0; i < passengerCount; i++) {
    if (i < freeBerths.length) {
      result.push({ status: 'CNF', berthId: freeBerths[i].berthId, position: null });
    } else if (racLeft > 0) {
      racLeft -= 1;
      rac += 1;
      result.push({ status: 'RAC', berthId: null, position: rac });
    } else {
      wl += 1;
      result.push({ status: 'WL', berthId: null, position: wl });
    }
  }
  return result;
}

module.exports = { assignStatuses };
