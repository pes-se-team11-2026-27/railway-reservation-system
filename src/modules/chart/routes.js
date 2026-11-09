'use strict';
const express = require('express');
const { pool } = require('../../db/pool');
const { requireRole } = require('../auth/session');
const audit = require('../audit/service');
const service = require('./service');

const router = express.Router();

// The full chart, with names, is for ticket examiners and administrators.
router.get('/:runId', requireRole('TTE', 'ADMIN'), async (req, res, next) => {
  try { res.json(await service.getChart(Number(req.params.runId))); } catch (err) { next(err); }
});

// An administrator can prepare a chart early; that override is audited.
router.post('/:runId/prepare', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const runId = Number(req.params.runId);
    const done = await service.prepareChart(runId);
    await audit.record({ actor: req.auth.login, action: 'CHART_EDIT', target: `run ${runId}`, details: { action: 'prepared early by hand', ...done } });
    res.json(done);
  } catch (err) { next(err); }
});

const pages = express.Router();

function staffPage(...roles) {
  return (req, res, next) => requireRole(...roles)(req, res, (err) => {
    if (!err) return next();
    if (err.status === 403) return res.status(403).render('staff-home', { auth: req.auth, forbidden: true });
    return res.redirect('/staff/login');
  });
}

// Upcoming runs and their chart state, for administrators.
pages.get('/admin/charts', staffPage('ADMIN'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, to_char(r.run_date, 'YYYY-MM-DD') AS run_date, t.number, t.name, r.chart_prepared, r.charted_at
         FROM train_runs r JOIN trains t ON t.id = r.train_id
        WHERE r.run_date BETWEEN current_date - 1 AND current_date + 3 ORDER BY r.run_date, t.number`);
    res.render('admin-charts', { runs: rows, notice: req.query.done ? `Chart prepared for run ${req.query.done}.` : null, error: null });
  } catch (err) { next(err); }
});

pages.post('/admin/charts/:runId/prepare', staffPage('ADMIN'), async (req, res, next) => {
  const runId = Number(req.params.runId);
  try {
    const done = await service.prepareChart(runId);
    await audit.record({ actor: req.auth.login, action: 'CHART_EDIT', target: `run ${runId}`, details: { action: 'prepared early by hand', ...done } });
    res.redirect(303, `/admin/charts?done=${runId}`);
  } catch (err) {
    if (!err.status) return next(err);
    res.redirect(303, '/admin/charts');
  }
});

// The printable chart, coach by coach.
pages.get('/chart/:runId', staffPage('TTE', 'ADMIN'), async (req, res, next) => {
  try {
    res.render('chart', { chart: await service.getChart(Number(req.params.runId)) });
  } catch (err) {
    if (err.status === 404) return res.status(404).render('not-found');
    next(err);
  }
});

module.exports = { basePath: '/api/chart', router, pages };
