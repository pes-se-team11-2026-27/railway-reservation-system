'use strict';
const { httpsUrl, redirectHandler, withHsts, tlsOptions } = require('../../src/tls');

describe('TLS settings (SR-001)', () => {
  test('refuses anything below TLS 1.2 and allows 1.3', () => {
    const o = tlsOptions({ cert: 'x', key: 'y' });
    expect(o.minVersion).toBe('TLSv1.2');
    expect(o.maxVersion).toBe('TLSv1.3');
  });

  test('plain HTTP is redirected to the same path on HTTPS', () => {
    expect(httpsUrl('localhost:3000', 3443, '/search?from=SBC')).toBe('https://localhost:3443/search?from=SBC');
  });

  test('port 443 is left out of the redirect (boundary)', () => {
    expect(httpsUrl('rail.example.com', 443, '/')).toBe('https://rail.example.com/');
  });

  test('the redirect uses 308 so a POST stays a POST', () => {
    const res = { writeHead: jest.fn(), end: jest.fn() };
    redirectHandler(3443)({ headers: { host: 'localhost:3000' }, url: '/api/payments/callback' }, res);
    expect(res.writeHead).toHaveBeenCalledWith(308, { Location: 'https://localhost:3443/api/payments/callback' });
  });

  test('the HTTPS wrapper adds HSTS and then hands over to the app', () => {
    const app = jest.fn();
    const res = { setHeader: jest.fn() };
    withHsts(app)({}, res);
    expect(res.setHeader).toHaveBeenCalledWith('Strict-Transport-Security', 'max-age=31536000');
    expect(app).toHaveBeenCalled();
  });
});
