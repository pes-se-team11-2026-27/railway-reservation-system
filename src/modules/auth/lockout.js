'use strict';

// RRS-SR-005: 5 failed sign ins lock the account for 15 minutes.
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

// Given the failures so far, returns the state after one more failure.
function afterFailure(failedAttempts, now = new Date()) {
  const attempts = failedAttempts + 1;
  if (attempts >= MAX_FAILURES) {
    return { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60000) };
  }
  return { failedAttempts: attempts, lockedUntil: null };
}

function isLocked(lockedUntil, now = new Date()) {
  return Boolean(lockedUntil) && new Date(lockedUntil) > now;
}

module.exports = { afterFailure, isLocked, MAX_FAILURES, LOCK_MINUTES };
