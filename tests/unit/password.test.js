'use strict';
const { hashPassword, verifyPassword, passwordProblem } = require('../../src/modules/auth/password');

describe('password hashing (SR-005)', () => {
  test('hash is not the plain password and verifies correctly', async () => {
    const hash = await hashPassword('train2026');
    expect(hash).not.toContain('train2026');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('train2026', hash)).toBe(true);
  });

  test('wrong password does not verify', async () => {
    const hash = await hashPassword('train2026');
    expect(await verifyPassword('train2027', hash)).toBe(false);
  });

  test('same password hashes differently each time (per account salt)', async () => {
    const a = await hashPassword('train2026');
    const b = await hashPassword('train2026');
    expect(a).not.toBe(b);
  });

  test('malformed stored hash returns false instead of throwing (error case)', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', 'scrypt$16384$8$1$AAAA$')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$abc$8$1$AAAA$BBBB')).toBe(false);
  });
});

describe('password policy', () => {
  test('7 characters is rejected, 8 is accepted (boundary)', () => {
    expect(passwordProblem('abc1234')).toMatch(/at least 8/);
    expect(passwordProblem('abcd1234')).toBeNull();
  });

  test('needs a letter and a digit', () => {
    expect(passwordProblem('abcdefgh')).toMatch(/letter and a digit/);
    expect(passwordProblem('12345678')).toMatch(/letter and a digit/);
  });

  test('missing password is rejected', () => {
    expect(passwordProblem(undefined)).toMatch(/required/);
  });
});
