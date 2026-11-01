'use strict';
const request = require('supertest');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { dateAhead } = require('../helpers/fixtures');

const app = createApp();
afterAll(() => pool.end());

// Finds the next date (1 to 14 days ahead) whose ISO weekday is in the list.
function nextDay(isoDays) {
  for (let i = 1; i <= 14; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const iso = d.getDay() === 0 ? 7 : d.getDay();
    if (isoDays.includes(iso)) return dateAhead(i);
  }
  throw new Error('no matching day');
}

describe('TC-SRCH-01 train search', () => {
  test('weekday SBC to MAS lists all three trains with correct times', async () => {
    const res = await request(app).get('/api/trains/search').query({ from: 'SBC', to: 'MAS', date: nextDay([1, 2, 3, 4, 5]) });
    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.number)).toEqual(['12608', '12640', '12658']);
    const lalbagh = res.body[0];
    expect(lalbagh).toMatchObject({ departs: '06:20', arrives: '12:00', distanceKm: 362, arrivalDay: 0 });
    expect(lalbagh.classes).toEqual(['3A', 'SL']);
  });

  test('a train that does not run that day is not listed (weekend)', async () => {
    const res = await request(app).get('/api/trains/search').query({ from: 'SBC', to: 'MAS', date: nextDay([6, 7]) });
    expect(res.body.map((t) => t.number)).toEqual(['12608', '12640']);
  });

  test('intermediate stations work and distance is the difference', async () => {
    const res = await request(app).get('/api/trains/search').query({ from: 'KPD', to: 'MAS', date: nextDay([1, 2, 3, 4, 5]) });
    expect(res.body.map((t) => t.number)).toEqual(['12608', '12640']);
    expect(res.body[0].distanceKm).toBe(142);
  });

  test('overnight train shows next day arrival', async () => {
    const res = await request(app).get('/api/trains/search').query({ from: 'SBC', to: 'MAS', date: nextDay([1]) });
    const mail = res.body.find((t) => t.number === '12658');
    expect(mail.arrivalDay).toBe(1);
  });

  test('wrong direction returns no trains', async () => {
    const res = await request(app).get('/api/trains/search').query({ from: 'MAS', to: 'SBC', date: dateAhead(2) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('date beyond the booking window returns no trains (boundary)', async () => {
    const res = await request(app).get('/api/trains/search').query({ from: 'SBC', to: 'MAS', date: dateAhead(45) });
    expect(res.body).toEqual([]);
  });

  test('unknown station is refused (error case)', async () => {
    const res = await request(app).get('/api/trains/search').query({ from: 'XYZ', to: 'MAS', date: dateAhead(2) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_STATION');
  });

  test('search page renders results', async () => {
    const res = await request(app).get('/search').query({ from: 'SBC', to: 'MAS', date: dateAhead(1) });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Lalbagh Express');
  });
});
