'use strict';
const request = require('supertest');
const { totp } = require('../../src/modules/auth/totp');

// The demo staff from the seed (development only).
const STAFF = {
  admin1: { password: 'Admin@2026', secret: 'JBSWY3DPEHPK3PXP' },
  clerk1: { password: 'Clerk@2026', secret: 'KRSXG5CTMVRXEZLU' },
  tte1: { password: 'Tte@2026', secret: 'ORUGS4ZANFZSAYJA' },
};

// Signs a staff member in with password and authenticator code; returns the agent.
async function signInStaff(app, username) {
  const s = STAFF[username];
  const agent = request.agent(app);
  await agent.post('/api/auth/staff/login').send({ username, password: s.password }).expect(200);
  await agent.post('/api/auth/staff/verify').send({ code: totp(s.secret) }).expect(200);
  return agent;
}

module.exports = { signInStaff };
