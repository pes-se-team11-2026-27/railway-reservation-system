'use strict';
const { AppError, badRequest, notFound, conflict } = require('../../src/errors');

describe('AppError helpers', () => {
  test('badRequest carries status 400 and the code', () => {
    const e = badRequest('BAD_INPUT', 'Mobile number is required');
    expect(e).toBeInstanceOf(AppError);
    expect(e.status).toBe(400);
    expect(e.code).toBe('BAD_INPUT');
    expect(e.message).toBe('Mobile number is required');
  });

  test('notFound and conflict map to 404 and 409', () => {
    expect(notFound('X', 'x').status).toBe(404);
    expect(conflict('X', 'x').status).toBe(409);
  });
});
