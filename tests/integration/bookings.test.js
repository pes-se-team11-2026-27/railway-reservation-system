'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { sign } = require('../../src/modules/payment/gateway');
const notification = require('../../src/modules/notification/service');
const { getRunId } = require('../helpers/fixtures');
const { verifiedPassenger } = require('../helpers/passengers');

const app = createApp();
afterAll(() => pool.end());

let me;
beforeAll(async () => { me = await verifiedPassenger(app); });

async function holdAndPay(train, day, cls = 'SL', n = 1, who = me) {
  const runId = await getRunId(train, day);
  const hold = (await who.agent.post('/api/holds').send({
    runId, classCode: cls, quotaCode: 'GN', fromStation: 'SBC', toStation: 'MAS',
    passengers: Array.from({ length: n }, (_, i) => ({ name: `Traveller ${i + 1}`, age: 30 + i, gender: 'F' })),
  })).body;
  const pay = (await who.agent.post('/api/payments').send({ holdId: hold.id })).body;
  return { runId, hold, txRef: pay.txRef };
}
const succeed = (txRef) => {
  const fields = { txRef, status: 'SUCCESS', token: `tok_${txRef}` };
  return request(app).post('/api/payments/callback').set('x-gateway-signature', sign(fields)).send(fields);
};
const decline = (txRef) => {
  const fields = { txRef, status: 'DECLINED', token: '' };
  return request(app).post('/api/payments/callback').set('x-gateway-signature', sign(fields)).send(fields);
};
const waitForSends = async () => { await new Promise((r) => setImmediate(r)); await notification.dispatchPending(); };

describe('TC-PAY-03 ticket only after payment', () => {
  test('a successful payment gives one PNR, books the berths and sends one ticket by SMS and email', async () => {
    const { hold, txRef } = await holdAndPay('12608', 12, 'SL', 2);
    const res = await succeed(txRef);
    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({ outcome: 'CONFIRMED', firstTime: true });
    const pnr = res.body.booking.pnr;
    expect(pnr).toMatch(/^[1-9]\d{9}$/);

    const inv = await pool.query(`SELECT status FROM inventory WHERE hold_id = $1`, [hold.id]);
    expect(inv.rows.map((r) => r.status)).toEqual(['BOOKED', 'BOOKED']);
    expect((await pool.query('SELECT status FROM holds WHERE id = $1', [hold.id])).rows[0].status).toBe('CONFIRMED');

    await waitForSends();
    const msgs = await pool.query(`SELECT channel, sent_at, reference FROM notifications n JOIN bookings b ON b.id = n.booking_id WHERE b.pnr = $1 ORDER BY channel`, [pnr]);
    expect(msgs.rows.map((m) => m.channel)).toEqual(['EMAIL', 'SMS']);
    expect(msgs.rows.every((m) => m.sent_at && m.reference.startsWith('MSG-'))).toBe(true);
    const to = await pool.query(`SELECT channel, recipient FROM notifications n JOIN bookings b ON b.id = n.booking_id WHERE b.pnr = $1 ORDER BY channel`, [pnr]);
    expect(to.rows).toEqual([{ channel: 'EMAIL', recipient: me.user.email }, { channel: 'SMS', recipient: me.user.mobile }]);
  });

  test('a declined payment leaves no PNR and frees the held berths', async () => {
    const { hold, txRef } = await holdAndPay('12640', 12);
    const berth = hold.passengers[0].berthId;
    const res = await decline(txRef);
    expect(res.body.booking.outcome).toBe('DECLINED');
    expect((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE hold_id = $1', [hold.id])).rows[0].n).toBe(0);
    const inv = await pool.query('SELECT status FROM inventory WHERE run_id = $1 AND berth_id = $2', [hold.runId, berth]);
    expect(inv.rows[0].status).toBe('FREE');
  });

  test('the passenger who booked can read it by PNR, with the mobile masked', async () => {
    const { txRef } = await holdAndPay('12608', 12, '3A');
    const pnr = (await succeed(txRef)).body.booking.pnr;
    const b = await me.agent.get(`/api/bookings/${pnr}`);
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ pnr, status: 'CONFIRMED', from: 'SBC', to: 'MAS', classCode: '3A' });
    expect(b.body.passengers[0].status).toBe('CNF');
    expect(JSON.stringify(b.body)).not.toContain(me.user.mobile);
    expect((await me.agent.get('/api/bookings/0000000000')).status).toBe(404);
  });

  test('another passenger cannot read the booking, and nobody can without signing in', async () => {
    const { txRef } = await holdAndPay('12640', 12, 'SL');
    const pnr = (await succeed(txRef)).body.booking.pnr;
    const other = await verifiedPassenger(app);
    expect((await other.agent.get(`/api/bookings/${pnr}`)).status).toBe(403);
    expect((await request(app).get(`/api/bookings/${pnr}`)).status).toBe(401);
    expect((await other.agent.get(`/ticket/${pnr}`)).status).toBe(403);
  });

  test('the ticket page shows the PNR and a QR code to its owner', async () => {
    const { txRef } = await holdAndPay('12640', 12, '3A');
    const pnr = (await succeed(txRef)).body.booking.pnr;
    const page = await me.agent.get(`/ticket/${pnr}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(pnr);
    expect(page.text).toMatch(/<svg[^>]*viewBox/);
    const anon = await request(app).get(`/ticket/${pnr}`);
    expect(anon.status).toBe(303);
    expect(anon.headers.location).toBe(`/signin?next=${encodeURIComponent(`/ticket/${pnr}`)}`);
  });
});

describe('TC-PAY-04 one payment never makes two tickets', () => {
  test('the same callback delivered five times gives one PNR, one charge and one set of messages', async () => {
    const { txRef } = await holdAndPay('12608', 13);
    const pnrs = [];
    for (let i = 0; i < 5; i++) pnrs.push((await succeed(txRef)).body.booking.pnr);
    expect(new Set(pnrs).size).toBe(1);
    const counts = await pool.query(
      `SELECT (SELECT count(*)::int FROM bookings WHERE payment_tx_ref = $1) AS bookings,
              (SELECT count(*)::int FROM payments WHERE tx_ref = $1) AS charges,
              (SELECT count(*)::int FROM notifications n JOIN bookings b ON b.id = n.booking_id WHERE b.payment_tx_ref = $1) AS messages,
              (SELECT count(*)::int FROM payment_callbacks WHERE tx_ref = $1) AS callbacks`, [txRef]);
    expect(counts.rows[0]).toEqual({ bookings: 1, charges: 1, messages: 2, callbacks: 5 });
  });

  test('five copies arriving at the same moment still give exactly one booking', async () => {
    const { txRef } = await holdAndPay('12640', 13);
    const results = await Promise.all(Array.from({ length: 5 }, () => succeed(txRef)));
    results.forEach((r) => expect(r.status).toBe(200));
    expect(new Set(results.map((r) => r.body.booking.pnr)).size).toBe(1);
    expect(results.filter((r) => r.body.booking.firstTime).length).toBe(1);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM bookings WHERE payment_tx_ref = $1', [txRef]);
    expect(rows[0].n).toBe(1);
  });
});

describe('payment after the berths are gone (sets up RRS-F-014)', () => {
  test('no PNR is issued and the payment is marked for refund', async () => {
    const { hold, txRef } = await holdAndPay('12608', 13, '3A');
    await pool.query(`UPDATE holds SET expires_at = now() - interval '1 second' WHERE id = $1`, [hold.id]);
    await pool.query(`UPDATE inventory SET hold_expires_at = now() - interval '1 second' WHERE hold_id = $1`, [hold.id]);
    const res = await succeed(txRef);
    expect(res.body.booking.outcome).toBe('ALLOCATION_FAILED');
    expect((await pool.query('SELECT count(*)::int AS n FROM bookings WHERE hold_id = $1', [hold.id])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT allocation_status FROM payments WHERE tx_ref = $1', [txRef])).rows[0].allocation_status).toBe('FAILED');
    expect((await succeed(txRef)).body.booking.outcome).toBe('ALLOCATION_FAILED');
  });
});

describe('confirmed RAC and waitlist places stay taken', () => {
  test('after a paid RAC booking, the next request gets the next RAC number, not the same one', async () => {
    const runId = await getRunId('12640', 13);
    const fill = (n) => me.agent.post('/api/holds').send({ runId, classCode: '3A', quotaCode: 'GN',
      passengers: Array.from({ length: n }, (_, i) => ({ name: `Fill ${i}`, age: 30, gender: 'M' })) });
    await fill(6); await fill(2);
    const racHold = (await fill(1)).body;
    expect(racHold.passengers[0]).toMatchObject({ status: 'RAC', position: 1 });
    const pay = (await me.agent.post('/api/payments').send({ holdId: racHold.id })).body;
    await succeed(pay.txRef);
    const next = (await fill(1)).body;
    expect(next.passengers[0]).toMatchObject({ status: 'RAC', position: 2 });
  });
});

describe('notification outbox (SAD ADR-03)', () => {
  test('a failed send is kept, counted and sent on the next attempt', async () => {
    let fail = true;
    notification.setProvider({ async send() { if (fail) throw new Error('SMS provider down'); return 'MSG-RETRY'; } });
    try {
      const { txRef } = await holdAndPay('12608', 14);
      const pnr = (await succeed(txRef)).body.booking.pnr;
      const mine = async () => (await pool.query(
        `SELECT attempts, sent_at, last_error, reference FROM notifications n JOIN bookings b ON b.id = n.booking_id WHERE b.pnr = $1`, [pnr])).rows;
      // The booking starts its own send in the background; wait until both messages were tried.
      for (let i = 0; i < 50 && !(await mine()).every((r) => r.attempts >= 1); i++) {
        await notification.dispatchPending();
        await new Promise((r) => setTimeout(r, 20));
      }
      let rows = await mine();
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.sent_at === null && r.attempts >= 1 && /down/.test(r.last_error))).toBe(true);
      fail = false;
      for (let i = 0; i < 50 && !(await mine()).every((r) => r.sent_at); i++) {
        await notification.dispatchPending();
        await new Promise((r) => setTimeout(r, 20));
      }
      rows = await mine();
      expect(rows.every((r) => r.sent_at && r.reference === 'MSG-RETRY')).toBe(true);
    } finally {
      notification.setProvider({ async send() { return 'MSG-TEST'; } });
    }
  });
});

describe('booking in the browser, end to end', () => {
  test('hold, pay on the gateway page, and land on the ticket', async () => {
    const runId = await getRunId('12640', 14);
    const held = await me.agent.post('/book').type('form').send({
      runId, classCode: 'SL', quotaCode: 'GN', fromStation: 'SBC', toStation: 'MAS',
      name1: 'Meera Rao', age1: '34', gender1: 'F',
    });
    expect(held.text).toContain('Pay now');
    expect(held.text).toContain('Rs 200.00');
    const holdId = /name="holdId" value="(\d+)"/.exec(held.text)[1];

    const toGateway = await me.agent.post('/book/pay').type('form').send({ holdId });
    expect(toGateway.status).toBe(303);
    const txRef = toGateway.headers.location.split('/').pop();

    const back = await request(app).post(`/gateway/pay/${txRef}`).type('form').send({ outcome: 'success' });
    const toTicket = await me.agent.get(back.headers.location);
    expect(toTicket.status).toBe(303);
    const ticket = await me.agent.get(toTicket.headers.location);
    expect(ticket.text).toContain('Booking confirmed');
  });

  test('the booking page sends someone who is not signed in to sign in first (UC-03)', async () => {
    const runId = await getRunId('12640', 14);
    const res = await request(app).get(`/book?runId=${runId}&class=SL`);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/signin?next=${encodeURIComponent(`/book?runId=${runId}&class=SL`)}`);
  });

  test('an unverified passenger verifies at sign in, then continues to booking (RRS-F-002)', async () => {
    const u = await verifiedPassenger(app, { verified: false });
    const runId = await getRunId('12640', 14);
    const next = `/book?runId=${runId}&class=SL`;
    expect((await u.agent.get(next)).status).toBe(303);
    const agent = request.agent(app);
    const step1 = await agent.post('/signin').type('form').send({ mobile: u.user.mobile, password: u.user.password, next });
    expect(step1.text).toContain('Verify your mobile number');
    const code = /class="code">(\d{6})</.exec(step1.text)[1];
    const step2 = await agent.post('/signin/verify').type('form').send({ code, next });
    expect(step2.status).toBe(303);
    expect(step2.headers.location).toBe(next);
    expect((await agent.get(next)).status).toBe(200);
  });

  test('sign in only ever returns to a page on this site (error case)', async () => {
    const res = await request(app).post('/signin').type('form')
      .send({ mobile: me.user.mobile, password: me.user.password, next: '//evil.example.com/steal' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/search');
  });

  test('a wrong password on the sign in page shows the error', async () => {
    const res = await request(app).post('/signin').type('form').send({ mobile: me.user.mobile, password: 'wrong1234', next: '/search' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('incorrect');
  });
});
