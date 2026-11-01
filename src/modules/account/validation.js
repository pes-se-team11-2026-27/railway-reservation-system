'use strict';
const { passwordProblem } = require('../auth/password');

const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME = /^[A-Za-z][A-Za-z .'-]{1,59}$/;

// Returns { field, message } for the first problem, or null if valid.
function registrationProblem(input) {
  const { name, mobile, email, password } = input || {};
  if (typeof name !== 'string' || !NAME.test(name.trim())) {
    return { field: 'name', message: 'Name must be 2 to 60 letters' };
  }
  if (typeof mobile !== 'string' || !MOBILE.test(mobile)) {
    return { field: 'mobile', message: 'Mobile number must be 10 digits starting with 6, 7, 8 or 9' };
  }
  if (typeof email !== 'string' || !EMAIL.test(email)) {
    return { field: 'email', message: 'Email address is not valid' };
  }
  const pw = passwordProblem(password);
  if (pw) return { field: 'password', message: pw };
  return null;
}

module.exports = { registrationProblem };
