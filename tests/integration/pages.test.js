'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');

const app = createApp();
afterAll(() => pool.end());

describe('page shell and accessibility basics', () => {
  test('home sends people straight to train search', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/search');
  });

  test('every page has a language, a skip link and one main landmark', async () => {
    for (const path of ['/search', '/register', '/fare']) {
      const res = await request(app).get(path);
      expect(res.text).toContain('<html lang="en-IN">');
      expect(res.text).toContain('href="#main"');
      expect(res.text.match(/<main /g)).toHaveLength(1);
      expect(res.text.match(/<h1>/g)).toHaveLength(1);
    }
  });

  test('the current page is marked in the navigation', async () => {
    const res = await request(app).get('/fare');
    expect(res.text).toMatch(/href="\/fare" aria-current="page"/);
  });

  test('a registration error marks the field and links the summary to it', async () => {
    const res = await request(app).post('/register').type('form')
      .send({ name: 'Meera Rao', mobile: '123', email: 'm@example.com', password: 'train2026' });
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/id="mobile"[^>]*aria-invalid="true"/);
    expect(res.text).toContain('href="#mobile"');
    expect(res.text).toContain('id="mobile-error"');
  });

  test('form fields carry autocomplete hints for faster, safer entry', async () => {
    const res = await request(app).get('/register');
    expect(res.text).toContain('autocomplete="tel-national"');
    expect(res.text).toContain('autocomplete="new-password"');
  });

  test('an unknown page gets an HTML page for browsers (error case)', async () => {
    const res = await request(app).get('/no/such/page').set('Accept', 'text/html');
    expect(res.status).toBe(404);
    expect(res.text).toContain('Page not found');
  });

  test('an unknown API route still gets JSON', async () => {
    const res = await request(app).get('/api/nope').set('Accept', 'application/json');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
