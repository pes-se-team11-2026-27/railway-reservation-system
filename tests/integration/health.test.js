'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');

const app = createApp();
afterAll(() => pool.end());

describe('GET /health', () => {
  test('reports the service and database as up', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'UP', db: 'UP' });
    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  test('unknown route returns a clean 404 with no stack trace', async () => {
    const res = await request(app).get('/no/such/route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });

  test('malformed JSON body returns 400, not 500', async () => {
    const res = await request(app).post('/health').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_JSON');
  });
});
