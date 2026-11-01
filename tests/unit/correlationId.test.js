'use strict';
const correlationId = require('../../src/middleware/correlationId');

function run(incoming) {
  const req = { get: () => incoming };
  const headers = {};
  const res = { set: (k, v) => { headers[k] = v; } };
  let called = false;
  correlationId(req, res, () => { called = true; });
  return { req, headers, called };
}

describe('correlationId middleware', () => {
  test('generates an id when none is sent', () => {
    const { req, headers, called } = run(undefined);
    expect(called).toBe(true);
    expect(req.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['x-correlation-id']).toBe(req.correlationId);
  });

  test('reuses a well formed incoming id', () => {
    expect(run('abc12345-trace').req.correlationId).toBe('abc12345-trace');
  });

  test('rejects a malformed incoming id (error case)', () => {
    expect(run('bad id; drop').req.correlationId).not.toBe('bad id; drop');
  });
});
