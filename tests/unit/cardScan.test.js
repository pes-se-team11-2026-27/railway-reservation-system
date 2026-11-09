'use strict';
const { Writable } = require('stream');
const pino = require('pino');
const { luhnValid, findCardNumbers, findCardFields, scanText } = require('../../src/security/cardScan');
const logger = require('../../src/logger');

describe('card number detection (NF-005, SR-002)', () => {
  test('the Luhn checksum separates card numbers from other long numbers', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
  });

  test('finds card numbers written plainly, in groups, or with dashes, and masks them', () => {
    expect(findCardNumbers('pan 4111111111111111 end')).toEqual(['************1111']);
    expect(findCardNumbers('4111 1111 1111 1111')).toEqual(['************1111']);
    expect(findCardNumbers('5500-0000-0000-0004')).toEqual(['************0004']);
    expect(findCardNumbers('amex 378282246310005')).toEqual(['***********0005']);
  });

  test('ignores PNRs, mobiles, references and numbers that fail the checksum', () => {
    expect(findCardNumbers('PNR 7971116316 mobile 9876543210 TXB01578F9CA9C 51375')).toEqual([]);
    expect(findCardNumbers('1234567812345678')).toEqual([]);
    expect(findCardNumbers('0000000000000000')).toEqual([]);
  });

  test('ignores digit runs inside hashes and tokens (no false alarms from session hashes)', () => {
    // A real looking SHA-256 hex hash whose digit run passes Luhn
    expect(findCardNumbers('{"token_hash":"9f3a4111111111111111b2c7e0"}')).toEqual([]);
    expect(findCardNumbers('tok_4111111111111111x')).toEqual([]);
    expect(findCardNumbers('"4111111111111111"')).toEqual(['************1111']);
  });

  test('finds card fields such as a stored security code', () => {
    expect(findCardFields('{"txRef":"TX1","cvv":"123"}')).toEqual(['cvv']);
    expect(findCardFields('{"card_number":"x","expiry":"12/29"}')).toEqual(['card_number', 'expiry']);
    expect(scanText('{"status":"SUCCESS"}', 'row')).toEqual([]);
  });
});

describe('logs never carry card data or secrets', () => {
  test('card fields, passwords and session cookies are replaced before writing', () => {
    let out = '';
    const sink = new Writable({ write(chunk, _enc, done) { out += chunk; done(); } });
    const log = pino({ ...logger.options, level: 'info' }, sink);
    log.info({ body: { cardNumber: '4111111111111111', cvv: '123', password: 'train2026' }, req: { headers: { cookie: 'rrs_session=abc' } } }, 'test');
    expect(out).not.toContain('4111111111111111');
    expect(out).not.toContain('"123"');
    expect(out).not.toContain('train2026');
    expect(out).not.toContain('rrs_session=abc');
    expect(out).toContain('[REDACTED]');
  });
});
