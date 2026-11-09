'use strict';
const crypto = require('crypto');
const request = require('supertest');

// Names may only contain letters, so the suffix is spelled out in letters.
const letters = (n) => String(n).split('').map((d) => 'abcdefghij'[Number(d)]).join('');

// A registered passenger with a verified mobile, signed in. Returns the
// supertest agent (it keeps the session cookie) and the account details.
async function verifiedPassenger(app, { verified = true } = {}) {
  // Random, so test files that each create passengers never collide.
  const mobile = '9' + String(crypto.randomInt(0, 1e9)).padStart(9, '0');
  const user = { name: `Passenger ${letters(mobile.slice(-4))}`, mobile, email: `p${letters(mobile)}@example.com`, password: 'train2026' };
  const created = await request(app).post('/api/accounts').send(user).expect(201);
  if (verified) {
    const otp = await request(app).post(`/api/accounts/${created.body.id}/otp`).expect(201);
    await request(app).post(`/api/accounts/${created.body.id}/verify`).send({ code: otp.body.devCode }).expect(200);
  }
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ mobile, password: user.password }).expect(200);
  return { agent, user: { ...user, id: created.body.id } };
}

module.exports = { verifiedPassenger };
