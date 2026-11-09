'use strict';
const express = require('express');
const { AppError } = require('../../errors');
const { createLimiter } = require('./limiter');
const service = require('./service');

const limiter = createLimiter({ limit: 30, windowMs: 60000 });

// Every lookup counts, found or not, so the limit also stops someone trying
// PNR after PNR to find bookings.
function limited(req, res, next) {
  const verdict = limiter.allow(req.ip);
  if (verdict.allowed) return next();
  res.set('Retry-After', String(verdict.retryAfterSeconds));
  next(new AppError(429, 'RATE_LIMITED', `Too many PNR lookups. Try again in ${verdict.retryAfterSeconds} seconds`));
}

const router = express.Router();
router.get('/:pnr', limited, async (req, res, next) => {
  try { res.json(await service.publicStatus(req.params.pnr)); } catch (err) { next(err); }
});

const pages = express.Router();
pages.get('/pnr', (req, res, next) => {
  if (!req.query.number) return res.render('pnr', { number: '', result: null, error: null });
  limited(req, res, async (err) => {
    try {
      if (err) return res.status(err.status).render('pnr', { number: req.query.number, result: null, error: err.message });
      const result = await service.publicStatus(String(req.query.number).trim());
      res.render('pnr', { number: req.query.number, result, error: null });
    } catch (e) {
      if (!e.status) return next(e);
      res.status(e.status).render('pnr', { number: req.query.number, result: null, error: e.message });
    }
  });
});

module.exports = { basePath: '/api/pnr', router, pages, limiter };
