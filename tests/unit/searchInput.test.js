'use strict';
const { checkSearchInput } = require('../../src/modules/search/service');

const tomorrow = () => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

describe('search input checks (F-003)', () => {
  test('valid input passes', () => {
    expect(() => checkSearchInput({ from: 'SBC', to: 'MAS', date: tomorrow() })).not.toThrow();
  });

  test('same origin and destination is refused', () => {
    expect(() => checkSearchInput({ from: 'SBC', to: 'SBC', date: tomorrow() })).toThrow(/different/);
  });

  test('missing station is refused', () => {
    expect(() => checkSearchInput({ from: 'SBC', date: tomorrow() })).toThrow(/required/);
  });

  test('malformed and past dates are refused (boundary)', () => {
    expect(() => checkSearchInput({ from: 'SBC', to: 'MAS', date: '01-11-2026' })).toThrow(/format/);
    expect(() => checkSearchInput({ from: 'SBC', to: 'MAS', date: '2000-01-01' })).toThrow(/past/);
  });
});
