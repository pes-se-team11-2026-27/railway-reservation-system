'use strict';
const express = require('express');
const service = require('./service');
const gateway = require('./gateway');
const { settlePayment } = require('../booking/settle');
const checkout = require('../booking/checkout');
const refunds = require('./refunds');

const router = express.Router();

// Only the signed in, verified passenger who owns the hold can start a
// payment, and the amount is worked out on the server: any amount in the
// request is ignored (RRS-F-002, SAD 3.9 tampering).
router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await checkout.startPayment(req.auth, req.body && req.body.holdId));
  } catch (err) { next(err); }
});

// The gateway calls this when a payment finishes. The signature travels in a header.
// Every callback, first or repeated, is settled; settling is idempotent, so a
// retry by the gateway returns the same PNR and creates nothing new (RRS-F-013).
router.post('/callback', async (req, res, next) => {
  try {
    const result = await service.receiveCallback(req.body, req.get('x-gateway-signature'));
    res.json({ ...result, booking: await settlePayment(result) });
  } catch (err) { next(err); }
});

router.get('/:txRef', async (req, res, next) => {
  try {
    res.json({ ...(await service.getPayment(req.params.txRef)), refunds: await refunds.refundsFor(req.params.txRef) });
  } catch (err) { next(err); }
});

// A stand in for the gateway's hosted page, used in development and the demo.
// It belongs to the "gateway", not to the railway system, and it never asks
// for card details: the buttons simulate the result the real gateway reports.
const pages = express.Router();

pages.get('/gateway/pay/:txRef', async (req, res, next) => {
  try {
    const payment = await service.getPayment(req.params.txRef);
    res.render('gateway', { payment, result: null });
  } catch (err) {
    if (err.status === 404) return res.status(404).render('not-found');
    next(err);
  }
});

pages.post('/gateway/pay/:txRef', async (req, res, next) => {
  try {
    const status = req.body.outcome === 'success' ? 'SUCCESS' : 'DECLINED';
    const fields = { txRef: req.params.txRef, status, token: status === 'SUCCESS' ? 'tok_' + req.params.txRef.toLowerCase() : '' };
    // The gateway signs and reports the result, exactly as its server would,
    // then sends the passenger back to the railway site.
    const result = await service.receiveCallback(fields, gateway.sign(fields));
    await settlePayment(result);
    res.redirect(303, `/payment/return/${req.params.txRef}`);
  } catch (err) { next(err); }
});

module.exports = { basePath: '/api/payments', router, pages };
