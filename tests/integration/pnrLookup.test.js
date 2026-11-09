'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { sign } = require('../../src/modules/payment/gateway');
const { limiter } = require('../../src/modules/pnr/routes');
const { getRunId } = require('../helpers/fixtures');
const { verifiedPassenger } = require('../helpers/passengers');

const app = createApp();
afterAll(() => pool.end());
beforeEach(() => limiter.reset());

let pnr;
let me;
beforeAll(async () => {
  me = await verifiedPassenger(app);
  const runId = await getRunId('12608', 17);
  const hold = (await me.agent.post('/api/holds').send({
    runId, classCode: 'SL', quotaCode: 'GN', fromStation: 'SBC', toStation: 'MAS',
    passengers: [{ name: 'Meera Rao', age: 34, gender: 'F' }, { name: 'Ravi Kumar Rao', age: 36, gender: 'M' }],
  })).body;
  const pay = (await me.agent.post('/api/payments').send({ holdId: hold.id })).body;
  const fields = { txRef: pay.txRef, status: 'SUCCESS', token: 'tok_pnr' };
  const res = await request(app).post('/api/payments/callback').set('x-gateway-signature', sign(fields)).send(fields);
  pnr = res.body.booking.pnr;
});

describe('TC-SEC-05 masked PNR status', () => {
  test('anyone can look up a PNR, and sees initials only', async () => {
    const res = await request(app).get(`/api/pnr/${pnr}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pnr, bookingStatus: 'CONFIRMED', classCode: 'SL', from: 'SBC', to: 'MAS' });
    expect(res.body.passengers.map((p) => p.initials)).toEqual(['M. R.', 'R. K. R.']);
    expect(res.body.passengers[0].status).toBe('CNF');
  });

  test('no name, age, gender, contact or amount leaves the system', async () => {
    const text = JSON.stringify((await request(app).get(`/api/pnr/${pnr}`)).body);
    for (const secret of ['Meera', 'Rao', 'Ravi', me.user.mobile, me.user.email]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/"age"|"gender"|"amount|"mobile"|"email"/);
  });

  test('the 31st lookup in a minute is refused (boundary)', async () => {
    for (let i = 0; i < 30; i++) expect((await request(app).get(`/api/pnr/${pnr}`)).status).toBe(200);
    const res = await request(app).get(`/api/pnr/${pnr}`);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  test('lookups of unknown PNRs count too, so guessing is limited', async () => {
    for (let i = 0; i < 30; i++) await request(app).get(`/api/pnr/${1000000000 + i}`);
    expect((await request(app).get(`/api/pnr/${pnr}`)).status).toBe(429);
  });

  test('malformed and unknown PNRs are refused (error cases)', async () => {
    expect((await request(app).get('/api/pnr/12345')).status).toBe(400);
    expect((await request(app).get('/api/pnr/0123456789')).status).toBe(400);
    expect((await request(app).get('/api/pnr/9999999999')).status).toBe(404);
  });

  test('the PNR status page shows initials and berth', async () => {
    const page = await request(app).get('/pnr').query({ number: pnr });
    expect(page.status).toBe(200);
    expect(page.text).toContain('M. R.');
    expect(page.text).not.toContain('Meera');
    expect(page.text).toMatch(/S1\/\d+/);
  });
});
