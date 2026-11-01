'use strict';
const express = require('express');
const { pool } = require('../../db/pool');
const service = require('./service');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await service.createHold(req.body));
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

// Booking page for the demo: pick class and quota, enter up to 3 passengers.
const pages = express.Router();

async function runInfo(runId) {
  const { rows } = await pool.query(
    `SELECT r.id, to_char(r.run_date, 'YYYY-MM-DD') AS run_date, t.number, t.name,
            ARRAY(SELECT DISTINCT class_code FROM coaches c WHERE c.train_id = t.id ORDER BY 1) AS classes
       FROM train_runs r JOIN trains t ON t.id = r.train_id WHERE r.id = $1`, [runId]);
  return rows[0] || null;
}

pages.get('/book', async (req, res, next) => {
  try {
    const run = await runInfo(Number(req.query.runId));
    if (!run) return res.status(404).render('book', { run: null, hold: null, error: 'Pick a train from the search page first', values: {} });
    res.render('book', { run, hold: null, error: null, values: { classCode: req.query.class || '' } });
  } catch (err) { next(err); }
});

pages.post('/book', async (req, res, next) => {
  try {
    const run = await runInfo(Number(req.body.runId));
    const passengers = [1, 2, 3]
      .map((n) => ({ name: req.body[`name${n}`], age: Number(req.body[`age${n}`]), gender: req.body[`gender${n}`] }))
      .filter((p) => p.name && p.name.trim());
    try {
      const hold = await service.createHold({
        runId: Number(req.body.runId), classCode: req.body.classCode, quotaCode: req.body.quotaCode, passengers,
      });
      res.render('book', { run, hold, error: null, values: {} });
    } catch (err) {
      if (!err.status) throw err;
      res.status(err.status).render('book', { run, hold: null, error: err.message, values: req.body });
    }
  } catch (err) { next(err); }
});

module.exports = { basePath: '/api/holds', router, pages };
