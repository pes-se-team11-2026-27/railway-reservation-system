'use strict';
// TC-SEC-02: starts a real HTTPS server and checks what it accepts.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const tls = require('tls');
const { execSync } = require('child_process');
const { createApp } = require('../../src/app');
const { pool } = require('../../src/db/pool');
const { tlsOptions, redirectHandler, withHsts } = require('../../src/tls');

let hasOpenssl = true;
try { execSync('openssl version', { stdio: 'ignore' }); } catch { hasOpenssl = false; }
const maybe = hasOpenssl ? describe : describe.skip;

let secure;
let plain;
let dir;

beforeAll(async () => {
  if (!hasOpenssl) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrs-tls-'));
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=localhost" -keyout "${dir}/key.pem" -out "${dir}/cert.pem"`, { stdio: 'ignore' });
  secure = https.createServer(tlsOptions({ certPath: `${dir}/cert.pem`, keyPath: `${dir}/key.pem` }), withHsts(createApp()));
  await new Promise((r) => secure.listen(0, r));
  plain = http.createServer(redirectHandler(secure.address().port));
  await new Promise((r) => plain.listen(0, r));
});

afterAll(async () => {
  if (secure) secure.close();
  if (plain) plain.close();
  await pool.end();
});

function handshake(options) {
  return new Promise((resolve) => {
    const socket = tls.connect({ port: secure.address().port, host: '127.0.0.1', rejectUnauthorized: false, ...options });
    socket.once('secureConnect', () => { const v = socket.getProtocol(); socket.end(); resolve(v); });
    socket.once('error', () => resolve(null));
  });
}

maybe('TC-SEC-02 TLS floor', () => {
  test('a client limited to TLS 1.1 is refused', async () => {
    expect(await handshake({ minVersion: 'TLSv1', maxVersion: 'TLSv1.1' })).toBeNull();
  });

  test('TLS 1.2 is accepted (boundary)', async () => {
    expect(await handshake({ minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' })).toBe('TLSv1.2');
  });

  test('TLS 1.3 is used when the client supports it', async () => {
    expect(await handshake({})).toBe('TLSv1.3');
  });

  test('plain HTTP serves nothing and redirects to HTTPS', async () => {
    const res = await new Promise((resolve) => http.get({ port: plain.address().port, path: '/search' }, resolve));
    expect(res.statusCode).toBe(308);
    expect(res.headers.location).toBe(`https://localhost:${secure.address().port}/search`);
  });

  test('responses over HTTPS carry HSTS', async () => {
    const res = await new Promise((resolve, reject) => {
      https.get({ port: secure.address().port, host: '127.0.0.1', path: '/health', rejectUnauthorized: false }, resolve).on('error', reject);
    });
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
    res.resume();
  });
});
