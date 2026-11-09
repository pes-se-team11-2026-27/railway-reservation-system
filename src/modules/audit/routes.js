'use strict';
const express = require('express');
const service = require('./service');

const router = express.Router();

// Read only. Entries are written by the modules that perform privileged
// actions (fare and quota changes, manual refunds, chart edits, overrides).
// Access is limited to administrators once staff roles land (RRS-SR-003).
router.get('/', async (req, res, next) => {
  try {
    res.json(await service.list(req.query));
  } catch (err) { next(err); }
});

module.exports = { basePath: '/api/audit', router };
