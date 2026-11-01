'use strict';
const { int } = require('../../src/config');

describe('config int parser', () => {
  test('parses a number string', () => {
    expect(int('8080', 3000)).toBe(8080);
  });

  test('falls back on missing or invalid values (boundary)', () => {
    expect(int(undefined, 3000)).toBe(3000);
    expect(int('abc', 3000)).toBe(3000);
    expect(int('', 3000)).toBe(3000);
  });
});
