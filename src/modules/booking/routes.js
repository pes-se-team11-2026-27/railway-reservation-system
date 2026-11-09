'use strict';
const express = require('express');
const { pool } = require('../../db/pool');
const { AppError } = require('../../errors');
const service = require('./service');
const { settlePayment, getBooking } = require('./settle');
const checkout = require('./checkout');

const router = express.Router();

// The hold belongs to whoever is signed in as a passenger; a user id in the
// request body is ignored, so nobody can hold berths in someone else's name.
const ownerOf = (req) => (req.auth && req.auth.kind === 'PASSENGER' ? req.auth.userId : null);

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await service.createHold({ ...req.body, userId: ownerOf(req) }));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getHold(Number(req.params.id)));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await service.releaseHold(Number(req.params.id)));
  } catch (err) { next(err); }
});

const pages = express.Router();

async function runInfo(runId) {
  const { rows } = await pool.query(
    `SELECT r.id, to_char(r.run_date, 'YYYY-MM-DD') AS run_date, t.number, t.name,
            ARRAY(SELECT DISTINCT class_code FROM coaches c WHERE c.train_id = t.id ORDER BY 1) AS classes
       FROM train_runs r JOIN trains t ON t.id = r.train_id WHERE r.id = $1`, [runId]);
  return rows[0] || null;
}

// Where to come back to after signing in: this page for a GET, otherwise
// the page the form was on (same site only), otherwise search.
function returnPath(req) {
  if (req.method === 'GET') return req.originalUrl;
  try {
    const from = new URL(req.get('referer') || '', 'http://local');
    return from.host === 'local' || from.host === req.get('host') ? from.pathname + from.search : '/search';
  } catch {
    return '/search';
  }
}

// UC-03 precondition: booking pages need a signed in passenger with a
// verified mobile. Anyone else is sent to sign in, then brought back here.
async function passengerPage(req, res, next) {
  try {
    req.passenger = await checkout.verifiedPassenger(req.auth);
    res.locals.passenger = req.passenger;
    next();
  } catch (err) {
    if (err.status !== 401 && err.status !== 403) return next(err);
    res.redirect(303, `/signin?next=${encodeURIComponent(returnPath(req))}`);
  }
}

pages.get('/book', passengerPage, async (req, res, next) => {
  try {
    const run = await runInfo(Number(req.query.runId));
    if (!run) return res.status(404).render('book', { run: null, hold: null, error: 'Pick a train from the search page first', values: {} });
    res.render('book', { run, hold: null, error: null, values: { classCode: req.query.class || '', fromStation: req.query.from || '', toStation: req.query.to || '' } });
  } catch (err) { next(err); }
});

pages.post('/book', passengerPage, async (req, res, next) => {
  try {
    const run = await runInfo(Number(req.body.runId));
    const passengers = [1, 2, 3]
      .map((n) => ({ name: req.body[`name${n}`], age: Number(req.body[`age${n}`]), gender: req.body[`gender${n}`] }))
      .filter((p) => p.name && p.name.trim());
    try {
      const hold = await service.createHold({
        runId: Number(req.body.runId), classCode: req.body.classCode, quotaCode: req.body.quotaCode, passengers,
        fromStation: req.body.fromStation || undefined, toStation: req.body.toStation || undefined,
        userId: req.passenger.id,
      });
      res.render('book', { run, hold, error: null, values: {}, amount: await checkout.amountFor(hold) });
    } catch (err) {
      if (!err.status) throw err;
      res.status(err.status).render('book', { run, hold: null, error: err.message, values: req.body });
    }
  } catch (err) { next(err); }
});

// Pay for a hold: the amount is worked out on the server, then the passenger
// goes to the gateway's hosted page.
pages.post('/book/pay', passengerPage, async (req, res, next) => {
  try {
    const started = await checkout.startPayment(req.auth, req.body.holdId);
    res.redirect(303, started.redirectUrl);
  } catch (err) {
    if (!err.status) return next(err);
    res.status(err.status).render('payment-return', { payment: null, outcome: 'ERROR', message: err.message });
  }
});

// Where the gateway sends the passenger back. Settling here as well is safe
// (idempotent) and covers a callback that has not arrived yet.
pages.get('/payment/return/:txRef', passengerPage, async (req, res, next) => {
  try {
    const p = await checkout.paymentOwnedBy(req.auth, req.params.txRef);
    if (p.status === 'PENDING') return res.render('payment-return', { payment: p, outcome: 'PENDING', message: null });
    const settled = await settlePayment({ txRef: p.txRef, holdId: p.holdId, status: p.status });
    if (settled.outcome === 'CONFIRMED') return res.redirect(303, `/ticket/${settled.pnr}`);
    res.render('payment-return', { payment: p, outcome: settled.outcome, message: null, refundRef: settled.refundRef });
  } catch (err) {
    if (err.status === 404) return res.status(404).render('not-found');
    if (err.status === 403) return res.status(403).render('payment-return', { payment: null, outcome: 'ERROR', message: err.message });
    next(err);
  }
});

// The full ticket: only the passenger who booked it, or signed in staff.
pages.get('/ticket/:pnr', async (req, res, next) => {
  try {
    const booking = await getBooking(req.params.pnr);
    if (!checkout.canView(req.auth, booking)) {
      if (!req.auth) return res.redirect(303, `/signin?next=${encodeURIComponent(req.originalUrl)}`);
      return res.status(403).render('payment-return', { payment: null, outcome: 'ERROR', message: 'This ticket belongs to another passenger.' });
    }
    res.render('ticket', { booking });
  } catch (err) {
    if (err.status === 404) return res.status(404).render('not-found');
    next(err);
  }
});

pages.get('/api/bookings/:pnr', async (req, res, next) => {
  try {
    const b = await getBooking(req.params.pnr);
    if (!req.auth) throw new AppError(401, 'NOT_SIGNED_IN', 'Sign in to see this booking');
    if (!checkout.canView(req.auth, b)) throw new AppError(403, 'FORBIDDEN', 'This booking belongs to another passenger');
    delete b.qrSvg;
    delete b.userId;
    res.json(b);
  } catch (err) { next(err); }
});

module.exports = { basePath: '/api/holds', router, pages };
