'use strict';
const express = require('express');
const service = require('./service');

const router = express.Router();

router.get('/:pnr/quote', async (req, res, next) => {
  try { res.json(await service.quote(req.auth, req.params.pnr)); } catch (err) { next(err); }
});

router.post('/:pnr', async (req, res, next) => {
  try { res.json(await service.cancel(req.auth, req.params.pnr)); } catch (err) { next(err); }
});

// Pages: see what you get back, then confirm.
const pages = express.Router();

pages.get('/ticket/:pnr/cancel', async (req, res, next) => {
  try {
    res.render('cancel', { quote: await service.quote(req.auth, req.params.pnr), result: null, error: null });
  } catch (err) {
    if (err.status === 401) return res.redirect(303, `/signin?next=${encodeURIComponent(req.originalUrl)}`);
    if (err.status === 404) return res.status(404).render('not-found');
    if (err.status === 403) return res.status(403).render('cancel', { quote: null, result: null, error: err.message });
    next(err);
  }
});

pages.post('/ticket/:pnr/cancel', async (req, res, next) => {
  try {
    res.render('cancel', { quote: null, result: await service.cancel(req.auth, req.params.pnr), error: null });
  } catch (err) {
    if (err.status === 401) return res.redirect(303, `/signin?next=${encodeURIComponent(`/ticket/${req.params.pnr}/cancel`)}`);
    if (!err.status) return next(err);
    res.status(err.status).render('cancel', { quote: null, result: null, error: err.message });
  }
});

module.exports = { basePath: '/api/cancel', router, pages };
