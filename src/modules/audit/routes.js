'use strict';
const express = require('express');
const service = require('./service');
const { requireRole } = require('../auth/session');

const router = express.Router();
// Only reservation administrators may read the log (RRS-SR-003, RRS-F-020).
router.use(requireRole('ADMIN'));

// Read only. Entries are written by the modules that perform privileged
// actions (fare and quota changes, manual refunds, chart edits, overrides).
router.get('/', async (req, res, next) => {
  try {
    res.json(await service.list(req.query));
  } catch (err) { next(err); }
});

module.exports = { basePath: '/api/audit', router };
