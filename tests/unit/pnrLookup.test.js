'use strict';
const { createLimiter } = require('../../src/modules/pnr/limiter');
const { initials } = require('../../src/modules/pnr/service');

describe('PNR lookup limit (SR-004)', () => {
  test('30 lookups in a minute are allowed and the 31st is refused (boundary)', () => {
    let t = 0;
    const l = createLimiter({ limit: 30, windowMs: 60000, now: () => t });
    for (let i = 0; i < 30; i++) expect(l.allow('a').allowed).toBe(true);
    const r = l.allow('a');
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBe(60);
  });

  test('lookups older than a minute stop counting', () => {
    let t = 0;
    const l = createLimiter({ limit: 30, windowMs: 60000, now: () => t });
    for (let i = 0; i < 30; i++) l.allow('a');
    t = 59999;
    expect(l.allow('a').allowed).toBe(false);
    t = 60000;
    expect(l.allow('a').allowed).toBe(true);
  });

  test('each client has its own count', () => {
    const l = createLimiter({ limit: 1, windowMs: 60000, now: () => 0 });
    expect(l.allow('a').allowed).toBe(true);
    expect(l.allow('b').allowed).toBe(true);
    expect(l.allow('a').allowed).toBe(false);
  });
});

describe('initials only', () => {
  test('names become initials', () => {
    expect(initials('Meera Rao')).toBe('M. R.');
    expect(initials('  kiran  ')).toBe('K.');
    expect(initials('')).toBe('');
  });
});
