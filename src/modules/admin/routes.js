'use strict';
const express = require('express');
const { requireRole } = require('../auth/session');
const audit = require('../audit/service');
const service = require('./service');

// Everything here is for reservation administrators only (RRS-SR-003).
const router = express.Router();
router.use(requireRole('ADMIN'));

const actorOf = (req) => req.auth.login;

router.get('/fare-rules', async (req, res, next) => {
  try { res.json(await service.listFareRules()); } catch (err) { next(err); }
});
router.post('/fare-rules', async (req, res, next) => {
  try { res.status(201).json(await service.addFareRule(req.body, actorOf(req))); } catch (err) { next(err); }
});
router.get('/quota-rules', async (req, res, next) => {
  try { res.json(await service.listQuotaRules()); } catch (err) { next(err); }
});
router.post('/quota-rules', async (req, res, next) => {
  try { res.status(201).json(await service.addQuotaRule(req.body, actorOf(req))); } catch (err) { next(err); }
});

// Pages of the administration console.
const pages = express.Router();

// Signed out staff go to sign in; other roles get a plain refusal page.
function adminPage(req, res, next) {
  requireRole('ADMIN')(req, res, (err) => {
    if (!err) return next();
    if (err.status === 403) return res.status(403).render('staff-home', { auth: req.auth, forbidden: true });
    return res.redirect('/staff/login');
  });
}

const num = (v) => (v === '' || v == null ? NaN : Number(v));

pages.get('/admin/fares', adminPage, async (req, res, next) => {
  try {
    res.render('admin-fares', { rules: await service.listFareRules(), error: null, notice: null, values: {} });
  } catch (err) { next(err); }
});

pages.post('/admin/fares', adminPage, async (req, res, next) => {
  const b = req.body;
  try {
    const added = await service.addFareRule({
      classCode: b.classCode, paisePerKm: num(b.paisePerKm), minKm: num(b.minKm), reservationPaise: num(b.reservationPaise),
      gstBps: num(b.gstBps), conveniencePaise: num(b.conveniencePaise), effectiveFrom: b.effectiveFrom,
    }, actorOf(req));
    res.render('admin-fares', { rules: await service.listFareRules(), error: null, notice: `New ${added.classCode} fare rule saved. It starts ${added.effectiveFrom.toLocaleString('en-IN')}.`, values: {} });
  } catch (err) {
    if (!err.status) return next(err);
    res.status(err.status).render('admin-fares', { rules: await service.listFareRules(), error: err.message, notice: null, values: b });
  }
});

pages.get('/admin/quotas', adminPage, async (req, res, next) => {
  try {
    res.render('admin-quotas', { rules: await service.listQuotaRules(), error: null, notice: null, values: {} });
  } catch (err) { next(err); }
});

pages.post('/admin/quotas', adminPage, async (req, res, next) => {
  try {
    const added = await service.addQuotaRule(req.body, actorOf(req));
    res.render('admin-quotas', { rules: await service.listQuotaRules(), error: null, notice: `Change saved. ${added.key} becomes ${added.value} from ${added.effectiveFrom.toLocaleString('en-IN')}.`, values: {} });
  } catch (err) {
    if (!err.status) return next(err);
    res.status(err.status).render('admin-quotas', { rules: await service.listQuotaRules(), error: err.message, notice: null, values: req.body });
  }
});

pages.get('/admin/audit', adminPage, async (req, res, next) => {
  try {
    const filters = { actor: req.query.actor || '', action: req.query.action || '', from: req.query.from || '', to: req.query.to || '' };
    let entries = [];
    let error = null;
    try { entries = await audit.list(filters); } catch (err) { if (!err.status) throw err; error = err.message; }
    res.render('admin-audit', { entries, filters, actions: audit.ACTIONS, error });
  } catch (err) { next(err); }
});

module.exports = { basePath: '/api/admin', router, pages };
