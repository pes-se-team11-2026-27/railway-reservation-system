'use strict';
const express = require('express');
const service = require('./service');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await service.quoteFare({
      train: req.query.train, from: req.query.from, to: req.query.to,
      classCode: req.query.class, passengers: req.query.passengers,
    }));
  } catch (err) { next(err); }
});

const pages = express.Router();

pages.get('/fare', async (req, res, next) => {
  try {
    const q = { train: req.query.train || '', from: req.query.from || '', to: req.query.to || '', classCode: req.query.class || 'SL', passengers: req.query.passengers || '1' };
    let quote = null;
    let error = null;
    if (q.train) {
      try { quote = await service.quoteFare(q); } catch (err) { if (!err.status) throw err; error = err.message; }
    }
    res.render('fare', { q, quote, error });
  } catch (err) { next(err); }
});

module.exports = { basePath: '/api/fares', router, pages };
