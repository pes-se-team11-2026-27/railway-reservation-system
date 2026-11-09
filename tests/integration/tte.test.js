'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { sign } = require('../../src/modules/payment/gateway');
const { verifyTicket } = require('../../public/handheld/verify');
const { getRunId } = require('../helpers/fixtures');
const { verifiedPassenger } = require('../helpers/passengers');
const { signInStaff } = require('../helpers/staff');

const app = createApp();
afterAll(() => pool.end());

let me;
beforeAll(async () => { me = await verifiedPassenger(app); });

async function paidBooking(runId) {
  const h = (await me.agent.post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'GN', passengers: [{ name: 'Check Me', age: 31, gender: 'F' }] })).body;
  const pay = (await me.agent.post('/api/payments').send({ holdId: h.id })).body;
  const fields = { txRef: pay.txRef, status: 'SUCCESS', token: `tok_${pay.txRef}` };
  return (await request(app).post('/api/payments/callback').set('x-gateway-signature', sign(fields)).send(fields)).body.booking.pnr;
}

describe('TC-CHT-02 ticket check against a downloaded chart', () => {
  test('valid, cancelled and other train tickets are told apart using only the chart', async () => {
    const runId = await getRunId('12608', 25);
    const valid = await paidBooking(runId);
    const cancelled = await paidBooking(runId);
    await me.agent.post(`/api/cancel/${cancelled}`).expect(200);
    const elsewhere = await paidBooking(await getRunId('12640', 25));
    await (await signInStaff(app, 'admin1')).post(`/api/chart/${runId}/prepare`).expect(200);

    // What the handheld downloads while it has network
    const tte = await signInStaff(app, 'tte1');
    const chart = (await tte.get(`/api/chart/${runId}`)).body;

    // From here on, no server is involved
    expect(verifyTicket(chart, `RRS:PNR=${valid}`)).toMatchObject({ valid: true, code: 'VALID' });
    expect(verifyTicket(chart, cancelled)).toMatchObject({ valid: false, code: 'CANCELLED' });
    expect(verifyTicket(chart, elsewhere)).toMatchObject({ valid: false, code: 'NOT_ON_THIS_TRAIN' });
  });
});

describe('the handheld page', () => {
  test("a ticket examiner gets the page and today's trains", async () => {
    const tte = await signInStaff(app, 'tte1');
    const page = await tte.get('/tte');
    expect(page.status).toBe(200);
    for (const script of ['/vendor/html5-qrcode.min.js', '/handheld/verify.js', '/handheld/app.js']) expect(page.text).toContain(script);
    const runs = await tte.get('/api/tte/runs');
    expect(runs.status).toBe(200);
    expect(runs.body.length).toBeGreaterThan(0);
    expect(runs.body[0]).toHaveProperty('runId');
  });

  test('a clerk and a passenger cannot use it; someone signed out is sent to sign in', async () => {
    const clerk = await signInStaff(app, 'clerk1');
    expect((await clerk.get('/tte')).status).toBe(403);
    expect((await clerk.get('/api/tte/runs')).status).toBe(403);
    expect((await me.agent.get('/api/tte/runs')).status).toBe(403);
    expect((await request(app).get('/tte')).status).toBe(302);
  });

  test('the offline worker is served and caches the page and its scripts', async () => {
    const res = await request(app).get('/tte-sw.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    for (const asset of ["'/tte'", "'/handheld/verify.js'", "'/vendor/html5-qrcode.min.js'"]) expect(res.text).toContain(asset);
    expect((await request(app).get('/vendor/html5-qrcode.min.js')).status).toBe(200);
  });
});
