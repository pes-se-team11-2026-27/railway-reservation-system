'use strict';

const QUOTAS = ['GN', 'TQ'];
const GENDERS = ['M', 'F', 'T'];
const MAX_PASSENGERS = 6;
const STATION = /^[A-Z]{2,5}$/;

// Returns a message for the first problem in a hold request, or null.
function holdRequestProblem(input) {
  const { runId, classCode, quotaCode, passengers } = input || {};
  if (!Number.isInteger(runId) || runId <= 0) return 'runId must be a positive whole number';
  if (typeof classCode !== 'string' || !classCode) return 'classCode is required';
  if (!QUOTAS.includes(quotaCode)) return `quotaCode must be one of ${QUOTAS.join(', ')}`;
  if (!Array.isArray(passengers) || passengers.length === 0) return 'At least one passenger is required';
  if (passengers.length > MAX_PASSENGERS) return `At most ${MAX_PASSENGERS} passengers per booking`;
  for (let i = 0; i < passengers.length; i++) {
    const p = passengers[i] || {};
    const n = i + 1;
    if (typeof p.name !== 'string' || p.name.trim().length < 2 || p.name.trim().length > 60) {
      return `Passenger ${n}: name must be 2 to 60 characters`;
    }
    if (!Number.isInteger(p.age) || p.age < 1 || p.age > 125) return `Passenger ${n}: age must be 1 to 125`;
    if (!GENDERS.includes(p.gender)) return `Passenger ${n}: gender must be M, F or T`;
  }
  // Optional: the journey, used to work out the fare.
  const { fromStation, toStation } = input;
  if (fromStation != null && !STATION.test(fromStation)) return 'fromStation must be a station code';
  if (toStation != null && !STATION.test(toStation)) return 'toStation must be a station code';
  return null;
}

module.exports = { holdRequestProblem, MAX_PASSENGERS };
