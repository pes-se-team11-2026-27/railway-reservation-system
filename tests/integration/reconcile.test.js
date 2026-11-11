'use strict';
// TC-REL-01 (RRS-NF-003): inventory and tickets agree. The positive controls
// break the data inside a transaction, check the break is caught, then roll back.
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { sign } = require('../../src/modules/payment/gateway');
const { reconcile } = require('../../src/modules/inventory/reconcile');
const { getRunId } = require('../helpers/fixtures');
const { verifiedPassenger } = require('../helpers/passengers');

const app = createApp();
afterAll(() => pool.end());

let booking;
beforeAll(async () => {
  const me = await verifiedPassenger(app);
  const runId = await getRunId('12608', 27);
  const pax = (n) => Array.from({ length: n }, (_, i) => ({ name: `Recon ${'abc'[i]}`, age: 30, gender: 'M' }));
  const h = (await me.agent.post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'GN', passengers: pax(2) })).body;
  const pay = (await me.agent.post('/api/payments').send({ holdId: h.id })).body;
  const fields = { txRef: pay.txRef, status: 'SUCCESS', token: 'tok_recon' };
  const res = await request(app).post('/api/payments/callback').set('x-gateway-signature', sign(fields)).send(fields);
  booking = { pnr: res.body.booking.pnr, holdId: h.id, runId, txRef: pay.txRef, berths: h.passengers.map((p) => p.berthId) };
});

// Runs fn against a transaction that is always rolled back.
async function withBrokenData(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
const failing = (r) => r.results.filter((x) => x.mismatches > 0).map((x) => x.id);

describe('TC-REL-01 inventory reconciliation', () => {
  test('after real bookings, every rule holds: zero mismatches', async () => {
    const r = await reconcile(pool);
    expect(failing(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.counts.bookings).toBeGreaterThan(0);
  });

  test('a berth given to two passengers is caught (positive control)', async () => {
    const r = await withBrokenData(async (c) => {
      await c.query(`UPDATE hold_passengers SET berth_id = $2 WHERE hold_id = $1 AND berth_id = $3`, [booking.holdId, booking.berths[0], booking.berths[1]]);
      return reconcile(c);
    });
    expect(failing(r)).toEqual(expect.arrayContaining(['BERTH_SOLD_TWICE']));
  });

  test('a booked berth with no ticket behind it is caught (positive control)', async () => {
    const r = await withBrokenData(async (c) => {
      await c.query(`UPDATE inventory SET status = 'BOOKED', hold_id = NULL WHERE run_id = $1 AND status = 'FREE'
                      AND berth_id = (SELECT min(berth_id) FROM inventory WHERE run_id = $1 AND status = 'FREE')`, [booking.runId]);
      return reconcile(c);
    });
    expect(failing(r)).toEqual(['BOOKED_WITHOUT_TICKET']);
  });

  test('a ticket whose payment is not confirmed is caught (positive control)', async () => {
    const r = await withBrokenData(async (c) => {
      await c.query(`UPDATE payments SET allocation_status = 'FAILED' WHERE tx_ref = $1`, [booking.txRef]);
      return reconcile(c);
    });
    expect(failing(r)).toEqual(['TICKET_WITHOUT_PAYMENT']);
  });

  test('after rolling back, the data is clean again', async () => {
    expect((await reconcile(pool)).ok).toBe(true);
  });
});
