'use strict';
const { sign, verify, canonical } = require('../../src/modules/payment/gateway');

const fields = { txRef: 'TXABC123', status: 'SUCCESS', token: 'tok_abc' };

describe('gateway callback signature (F-011)', () => {
  test('a signature made with the shared secret verifies', () => {
    expect(verify(fields, sign(fields))).toBe(true);
  });

  test('changing the status after signing breaks the signature (tampering)', () => {
    expect(verify({ ...fields, status: 'DECLINED' }, sign(fields))).toBe(false);
  });

  test('a signature made with another secret is refused', () => {
    expect(verify(fields, sign(fields, 'someone-elses-secret'))).toBe(false);
  });

  test('field order in the body does not matter, only the values', () => {
    expect(canonical({ token: 'tok_abc', status: 'SUCCESS', txRef: 'TXABC123' })).toBe(canonical(fields));
  });

  test('missing or malformed signatures are refused, not thrown (error case)', () => {
    expect(verify(fields, undefined)).toBe(false);
    expect(verify(fields, 'abc')).toBe(false);
    expect(verify(fields, 'z'.repeat(64))).toBe(false);
  });
});
