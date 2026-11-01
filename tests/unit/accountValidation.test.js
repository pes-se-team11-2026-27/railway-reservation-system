'use strict';
const { registrationProblem } = require('../../src/modules/account/validation');
const { canProceedToPayment } = require('../../src/modules/account/service');

const valid = { name: 'Ravi Kumar', mobile: '9876543210', email: 'ravi@example.com', password: 'train2026' };

describe('registration validation (F-001)', () => {
  test('accepts a valid registration', () => {
    expect(registrationProblem(valid)).toBeNull();
  });

  test('mobile must be exactly 10 digits (boundary)', () => {
    expect(registrationProblem({ ...valid, mobile: '987654321' }).field).toBe('mobile');
    expect(registrationProblem({ ...valid, mobile: '98765432101' }).field).toBe('mobile');
  });

  test('mobile must start with 6 to 9', () => {
    expect(registrationProblem({ ...valid, mobile: '5876543210' }).field).toBe('mobile');
    expect(registrationProblem({ ...valid, mobile: '6876543210' })).toBeNull();
  });

  test('rejects bad email, short name and weak password', () => {
    expect(registrationProblem({ ...valid, email: 'ravi@' }).field).toBe('email');
    expect(registrationProblem({ ...valid, name: 'R' }).field).toBe('name');
    expect(registrationProblem({ ...valid, password: 'short1' }).field).toBe('password');
  });

  test('missing body is rejected (error case)', () => {
    expect(registrationProblem(undefined).field).toBe('name');
  });
});

describe('payment gate (F-002)', () => {
  test('only a verified account may proceed to payment', () => {
    expect(canProceedToPayment({ mobileVerified: false })).toBe(false);
    expect(canProceedToPayment({ mobileVerified: true })).toBe(true);
    expect(canProceedToPayment(null)).toBe(false);
  });
});
