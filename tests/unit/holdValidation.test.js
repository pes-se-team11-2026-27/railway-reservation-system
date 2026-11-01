'use strict';
const { holdRequestProblem } = require('../../src/modules/booking/validation');

const pax = (n) => Array.from({ length: n }, (_, i) => ({ name: `Passenger ${i + 1}`, age: 30, gender: 'F' }));
const valid = { runId: 1, classCode: 'SL', quotaCode: 'GN', passengers: pax(1) };

describe('hold request validation', () => {
  test('accepts a valid request', () => {
    expect(holdRequestProblem(valid)).toBeNull();
  });

  test('needs at least one and at most six passengers (boundary)', () => {
    expect(holdRequestProblem({ ...valid, passengers: [] })).toMatch(/At least one/);
    expect(holdRequestProblem({ ...valid, passengers: pax(6) })).toBeNull();
    expect(holdRequestProblem({ ...valid, passengers: pax(7) })).toMatch(/At most 6/);
  });

  test('age must be 1 to 125 (boundary)', () => {
    expect(holdRequestProblem({ ...valid, passengers: [{ name: 'Asha', age: 0, gender: 'F' }] })).toMatch(/age/);
    expect(holdRequestProblem({ ...valid, passengers: [{ name: 'Asha', age: 1, gender: 'F' }] })).toBeNull();
    expect(holdRequestProblem({ ...valid, passengers: [{ name: 'Asha', age: 126, gender: 'F' }] })).toMatch(/age/);
  });

  test('rejects unknown quota, bad run id and bad gender (error cases)', () => {
    expect(holdRequestProblem({ ...valid, quotaCode: 'XX' })).toMatch(/quotaCode/);
    expect(holdRequestProblem({ ...valid, runId: '1' })).toMatch(/runId/);
    expect(holdRequestProblem({ ...valid, passengers: [{ name: 'Asha', age: 30, gender: 'X' }] })).toMatch(/gender/);
    expect(holdRequestProblem(undefined)).toMatch(/runId/);
  });
});
