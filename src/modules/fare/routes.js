'use strict';
const express = require('express');
const { pool } = require('../../db/pool');
const service = require('./service');

// Trains and stations for the pickers on the fare page.
async function pickerData() {
  const [trains, stations] = await Promise.all([
    pool.query('SELECT number, name FROM trains ORDER BY number'),
    pool.query('SELECT code, name FROM stations ORDER BY name'),
  ]);
  return { trains: trains.rows, stations: stations.rows };
}

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
    res.render('fare', { q, quote, error, ...(await pickerData()) });
  } catch (err) { next(err); }
});

module.exports = { basePath: '/api/fares', router, pages };
