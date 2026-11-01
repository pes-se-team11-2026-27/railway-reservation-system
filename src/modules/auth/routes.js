'use strict';
const express = require('express');
const { login } = require('./service');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    res.json(await login(req.body));
  } catch (err) { next(err); }
});

module.exports = { basePath: '/api/auth', router };
