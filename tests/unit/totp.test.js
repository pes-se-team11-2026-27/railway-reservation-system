'use strict';
const { totp, verifyTotp, base32Decode } = require('../../src/modules/auth/totp');

// RFC 6238 Appendix B test vectors (SHA-1, secret "12345678901234567890").
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('authenticator codes (SR-003 second factor)', () => {
  test('base32 secret decodes to the RFC secret', () => {
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
  });

  test('matches the published RFC 6238 test vectors', () => {
    expect(totp(RFC_SECRET, 59 * 1000, { digits: 8 })).toBe('94287082');
    expect(totp(RFC_SECRET, 1111111109 * 1000, { digits: 8 })).toBe('07081804');
    expect(totp(RFC_SECRET, 1234567890 * 1000, { digits: 8 })).toBe('89005924');
  });

  test('accepts the current code and one step of clock drift either side (boundary)', () => {
    const t = 1700000000 * 1000;
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t), t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t - 30000), t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t + 30000), t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t - 90000), t)).toBe(false);
  });

  test('refuses malformed codes instead of throwing (error case)', () => {
    expect(verifyTotp(RFC_SECRET, '12345')).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBe(false);
    expect(verifyTotp(RFC_SECRET, undefined)).toBe(false);
  });
});
