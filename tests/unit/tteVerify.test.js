'use strict';
const { readPnr, verifyTicket } = require('../../public/handheld/verify');

const chart = {
  train: { number: '12640', name: 'Brindavan Express' }, runDate: '2026-11-20', chartPrepared: true,
  bookings: [
    { pnr: '1111111111', status: 'CONFIRMED', passengers: [{ seq: 1, name: 'Meera Rao', age: 34, status: 'CNF', berth: 'B1/3' }] },
    { pnr: '2222222222', status: 'CANCELLED', passengers: [{ seq: 1, name: 'Ravi Rao', age: 36, status: 'CNF', berth: null }] },
    { pnr: '3333333333', status: 'CANCELLED', passengers: [{ seq: 1, name: 'Late Comer', age: 40, status: 'NOT_ON_CHART', berth: null }] },
    { pnr: '4444444444', status: 'CONFIRMED', passengers: [{ seq: 1, name: 'Anu Rao', age: 9, status: 'RAC', position: 1, berth: null }] },
  ],
};

describe('handheld ticket check (F-018)', () => {
  test('reads the ticket QR code and a typed PNR', () => {
    expect(readPnr('RRS:PNR=1111111111')).toBe('1111111111');
    expect(readPnr(' 1111111111 ')).toBe('1111111111');
    expect(readPnr('RRS:PNR=0111111111')).toBeNull();
    expect(readPnr('https://example.com')).toBeNull();
  });

  test('a confirmed ticket on this chart is valid, with berth', () => {
    const r = verifyTicket(chart, 'RRS:PNR=1111111111');
    expect(r).toMatchObject({ valid: true, code: 'VALID' });
    expect(r.passengers[0].berth).toBe('B1/3');
  });

  test('an RAC ticket is valid too', () => {
    expect(verifyTicket(chart, '4444444444')).toMatchObject({ valid: true });
  });

  test('a cancelled ticket is not valid, and says so', () => {
    expect(verifyTicket(chart, '2222222222')).toMatchObject({ valid: false, code: 'CANCELLED' });
  });

  test('a waitlisted ticket dropped at chart time is not valid', () => {
    expect(verifyTicket(chart, '3333333333')).toMatchObject({ valid: false, code: 'CANCELLED' });
  });

  test('a ticket for another train or date is not valid, with the reason', () => {
    const r = verifyTicket(chart, '9999999999');
    expect(r).toMatchObject({ valid: false, code: 'NOT_ON_THIS_TRAIN' });
    expect(r.message).toContain('12640');
  });

  test('unreadable codes and a missing chart are reported, not crashed on (error cases)', () => {
    expect(verifyTicket(chart, 'hello').code).toBe('UNREADABLE');
    expect(verifyTicket(null, '1111111111').code).toBe('NO_CHART');
  });
});
