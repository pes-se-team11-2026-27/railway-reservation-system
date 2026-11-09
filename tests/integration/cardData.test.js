'use strict';
// TC-SEC-01 (RRS-NF-005) and TC-SEC-03 (RRS-SR-002).
const { execFileSync } = require('child_process');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { config } = require('../../src/config');
const { sign } = require('../../src/modules/payment/gateway');
const { scanDatabase, scanText } = require('../../src/security/cardScan');
const { getRunId } = require('../helpers/fixtures');
const { verifiedPassenger } = require('../helpers/passengers');

const app = createApp();
afterAll(() => pool.end());

let hasPgDump = true;
try { execFileSync('pg_dump', ['--version'], { stdio: 'ignore' }); } catch { hasPgDump = false; }

beforeAll(async () => {
  // A full payment where the "gateway" also sends card fields it should not.
  const me = await verifiedPassenger(app);
  const runId = await getRunId('12608', 26);
  const hold = (await me.agent.post('/api/holds').send({ runId, classCode: 'SL', quotaCode: 'GN', passengers: [{ name: 'Card Test', age: 30, gender: 'F' }] })).body;
  const pay = (await me.agent.post('/api/payments').send({ holdId: hold.id, cardNumber: '4111111111111111', cvv: '123' })).body;
  const fields = { txRef: pay.txRef, status: 'SUCCESS', token: 'tok_card_test' };
  await request(app).post('/api/payments/callback').set('x-gateway-signature', sign(fields))
    .send({ ...fields, cardNumber: '4111 1111 1111 1111', cvv: '123', expiry: '12/29' }).expect(200);
});

describe('TC-SEC-01 and TC-SEC-03 no card data at rest', () => {
  test('after real payments, no table holds a card number or card field', async () => {
    const { tablesScanned, findings } = await scanDatabase(pool);
    expect(tablesScanned).toBeGreaterThan(15);
    expect(findings).toEqual([]);
  });

  test('the scanner does find card data when it is there (positive control)', async () => {
    await pool.query('CREATE TABLE scan_control (note TEXT)');
    try {
      await pool.query(`INSERT INTO scan_control VALUES ('paid with 5500 0000 0000 0004')`);
      const { findings } = await scanDatabase(pool);
      expect(findings).toEqual([{ source: 'table scan_control', kind: 'CARD_NUMBER', match: '************0004' }]);
    } finally {
      await pool.query('DROP TABLE scan_control');
    }
  });

  (hasPgDump ? test : test.skip)('a database backup holds no card data either', () => {
    const dump = execFileSync('pg_dump', ['--no-owner', '--data-only', config.databaseUrl], { maxBuffer: 256 * 1024 * 1024 }).toString();
    expect(dump.length).toBeGreaterThan(1000);
    expect(scanText(dump, 'backup')).toEqual([]);
  });
});
