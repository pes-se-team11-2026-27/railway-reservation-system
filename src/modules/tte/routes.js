'use strict';
const express = require('express');
const { pool } = require('../../db/pool');
const { requireRole } = require('../auth/session');

// Handheld ticket check for ticket examiners (RRS-F-018).
const router = express.Router();
router.use(requireRole('TTE', 'ADMIN'));

// Trains the examiner may need today: yesterday's overnight runs to tomorrow.
router.get('/runs', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id AS "runId", to_char(r.run_date, 'YYYY-MM-DD') AS "runDate", t.number, t.name, r.chart_prepared AS "chartPrepared"
         FROM train_runs r JOIN trains t ON t.id = r.train_id
        WHERE r.run_date BETWEEN current_date - 1 AND current_date + 1 ORDER BY r.run_date, t.number`);
    res.json(rows);
  } catch (err) { next(err); }
});

const pages = express.Router();
pages.get('/tte', (req, res) => requireRole('TTE', 'ADMIN')(req, res, (err) => {
  if (!err) return res.render('tte');
  if (err.status === 403) return res.status(403).render('staff-home', { auth: req.auth, forbidden: true });
  return res.redirect('/staff/login');
}));

module.exports = { basePath: '/api/tte', router, pages };
