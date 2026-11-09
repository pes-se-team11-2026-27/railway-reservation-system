'use strict';
const fs = require('fs');

// RRS-SR-001: TLS 1.2 or higher on every connection, TLS 1.3 preferred.
// Node negotiates the highest version both sides support, so 1.3 is used
// whenever the client can, and anything below 1.2 is refused.
function tlsOptions({ certPath, keyPath, cert, key } = {}) {
  return {
    cert: cert || fs.readFileSync(certPath),
    key: key || fs.readFileSync(keyPath),
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    honorCipherOrder: true,
  };
}

// Where a plain HTTP request is sent: the same host and path over HTTPS.
function httpsUrl(host, httpsPort, path) {
  const hostname = String(host || 'localhost').replace(/:\d+$/, '');
  const port = Number(httpsPort) === 443 ? '' : `:${httpsPort}`;
  return `https://${hostname}${port}${path || '/'}`;
}

// The whole plain HTTP server: every request is redirected, nothing is served.
// 308 keeps the method and body, so a POST is not silently turned into a GET.
function redirectHandler(httpsPort) {
  return (req, res) => {
    res.writeHead(308, { Location: httpsUrl(req.headers.host, httpsPort, req.url) });
    res.end();
  };
}

// Wraps the app for the HTTPS server: every response tells the browser to
// use HTTPS only for this site for a year (HSTS). Plain HTTP never reaches
// the app, so the header is only ever sent over a secure connection.
function withHsts(app) {
  return (req, res) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    return app(req, res);
  };
}

module.exports = { tlsOptions, httpsUrl, redirectHandler, withHsts };
