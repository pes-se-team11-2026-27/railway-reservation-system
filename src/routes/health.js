'use strict';
const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'UP', db: 'UP' });
  } catch {
    res.status(503).json({ status: 'DOWN', db: 'DOWN' });
  }
});

module.exports = router;
