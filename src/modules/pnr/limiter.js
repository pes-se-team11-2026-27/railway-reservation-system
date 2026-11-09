'use strict';

// A sliding one minute window per client (RRS-SR-004: 30 lookups a minute).
// Kept in memory: enough for one server; several servers would share it
// through the database or a cache instead.
function createLimiter({ limit = 30, windowMs = 60000, now = () => Date.now() } = {}) {
  const seen = new Map();
  return {
    // True if this client may make another request now; records it if so.
    allow(key) {
      const t = now();
      const recent = (seen.get(key) || []).filter((at) => t - at < windowMs);
      if (recent.length >= limit) {
        seen.set(key, recent);
        return { allowed: false, retryAfterSeconds: Math.ceil((windowMs - (t - recent[0])) / 1000) };
      }
      recent.push(t);
      seen.set(key, recent);
      return { allowed: true, remaining: limit - recent.length };
    },
    reset() { seen.clear(); },
  };
}

module.exports = { createLimiter };
