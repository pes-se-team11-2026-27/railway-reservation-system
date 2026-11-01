'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');

const app = createApp();
afterAll(() => pool.end());

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('pickers degrade to native controls', () => {
  test('search keeps real from and to selects that the pickers enhance', async () => {
    const res = await request(app).get('/search');
    expect(res.text).toMatch(/<select id="from" name="from"[^>]*data-combobox/);
    expect(res.text).toMatch(/<select id="to" name="to"[^>]*data-combobox/);
  });

  test('the date field is limited to the 30 day booking window (boundary)', async () => {
    const res = await request(app).get('/search');
    const now = new Date();
    const today = iso(now);
    const last = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 29));
    expect(res.text).toContain(`min="${today}"`);
    expect(res.text).toContain(`max="${last}"`);
  });

  test('the swap button stays hidden until the script can make it work', async () => {
    const res = await request(app).get('/search');
    expect(res.text).toMatch(/<button class="swap" type="button" data-swap hidden/);
  });

  test('fare page offers every train and station to pick from', async () => {
    const res = await request(app).get('/fare');
    for (const n of ['12608', '12640', '12658']) expect(res.text).toContain(`value="${n}"`);
    for (const c of ['SBC', 'BWT', 'KPD', 'MAS']) expect(res.text).toContain(`value="${c}"`);
  });

  test('results offer the previous and next day, but not a day before today (boundary)', async () => {
    const today = iso(new Date());
    const res = await request(app).get('/search').query({ from: 'SBC', to: 'MAS', date: today });
    expect(res.text).toContain('rel="next"');
    expect(res.text).not.toContain('rel="prev"');
  });
});
