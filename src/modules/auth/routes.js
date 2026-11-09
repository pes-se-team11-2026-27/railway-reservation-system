'use strict';
const express = require('express');
const { config } = require('../../config');
const { login } = require('./service');
const staff = require('./staff');
const session = require('./session');

const router = express.Router();
const showDevCode = config.env !== 'production';

// Passenger sign in (RRS-SR-005); now also starts a session (RRS-SR-003).
router.post('/login', async (req, res, next) => {
  try {
    const account = await login(req.body);
    const token = await session.createSession({ kind: 'PASSENGER', userId: account.id, role: 'PASSENGER', mfaPassed: true });
    session.setCookie(req, res, token);
    res.json(account);
  } catch (err) { next(err); }
});

// Staff sign in, step 1 of 2.
router.post('/staff/login', async (req, res, next) => {
  try {
    const { token, staff: who, mfaRequired } = await staff.passwordStep(req.body);
    session.setCookie(req, res, token);
    res.json({ ...who, mfaRequired });
  } catch (err) { next(err); }
});

// Staff sign in, step 2 of 2.
router.post('/staff/verify', async (req, res, next) => {
  try {
    res.json(await staff.mfaStep(req.auth, req.body && req.body.code));
  } catch (err) { next(err); }
});

router.post('/logout', async (req, res, next) => {
  try {
    await session.revoke(req.auth && req.auth.token);
    session.clearCookie(res);
    res.json({ signedOut: true });
  } catch (err) { next(err); }
});

router.get('/me', session.requireRole('PASSENGER', 'CLERK', 'ADMIN', 'TTE'), (req, res) => {
  const { kind, role, login: who, name } = req.auth;
  res.json({ kind, role, login: who, name });
});

// Pages: staff sign in in two steps, a staff home, and the admin console door.
const pages = express.Router();

pages.get('/staff/login', (req, res) => res.render('staff-login', { step: 'password', error: null, devCode: null, locked: !!req.authLocked }));

pages.post('/staff/login', async (req, res) => {
  try {
    const { token, staffId } = await staff.passwordStep(req.body);
    session.setCookie(req, res, token);
    const devCode = showDevCode ? await staff.currentCodeFor(staffId) : null;
    res.render('staff-login', { step: 'code', error: null, devCode, locked: false });
  } catch (err) {
    res.status(err.status || 500).render('staff-login', { step: 'password', error: err.message, devCode: null, locked: false });
  }
});

pages.post('/staff/verify', async (req, res) => {
  try {
    const who = await staff.mfaStep(req.auth, req.body.code);
    res.redirect(who.role === 'ADMIN' ? '/admin' : '/staff');
  } catch (err) {
    const devCode = showDevCode && req.auth ? await staff.currentCodeFor(req.auth.staffId) : null;
    res.status(err.status || 500).render('staff-login', { step: req.auth ? 'code' : 'password', error: err.message, devCode, locked: false });
  }
});

pages.post('/staff/logout', async (req, res) => {
  await session.revoke(req.auth && req.auth.token);
  session.clearCookie(res);
  res.redirect('/staff/login');
});

// Turns a failed guard into a page: sign in again, or a plain refusal.
function pageGuard(...roles) {
  const guard = session.requireRole(...roles);
  return (req, res, next) => guard(req, res, (err) => {
    if (!err) return next();
    if (err.status === 403) return res.status(403).render('staff-home', { auth: req.auth, forbidden: true });
    return res.redirect('/staff/login');
  });
}

pages.get('/staff', pageGuard('CLERK', 'ADMIN', 'TTE'), (req, res) => res.render('staff-home', { auth: req.auth, forbidden: false }));
pages.get('/admin', pageGuard('ADMIN'), (req, res) => res.render('admin', { auth: req.auth }));

module.exports = { basePath: '/api/auth', router, pages };
