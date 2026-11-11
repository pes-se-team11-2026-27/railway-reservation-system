'use strict';
const express = require('express');
const { requireRole } = require('../auth/session');
const service = require('./service');

const thisMonth = () => new Date().toISOString().slice(0, 7);

const router = express.Router();
router.get('/', requireRole('ADMIN'), async (req, res, next) => {
  try { res.json(await service.monthlyReport(req.query.month || thisMonth())); } catch (err) { next(err); }
});

const pages = express.Router();
pages.get('/admin/availability', (req, res, next) => requireRole('ADMIN')(req, res, async (err) => {
  if (err) {
    if (err.status === 403) return res.status(403).render('staff-home', { auth: req.auth, forbidden: true });
    return res.redirect('/staff/login');
  }
  try {
    const month = req.query.month || thisMonth();
    res.render('admin-availability', { report: await service.monthlyReport(month), month });
  } catch (e) {
    if (e.status === 400) return res.status(400).render('admin-availability', { report: null, month: req.query.month, error: e.message });
    next(e);
  }
}));

module.exports = { basePath: '/api/availability', router, pages };
