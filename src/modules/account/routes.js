'use strict';
const express = require('express');
const { config } = require('../../config');
const service = require('./service');

const router = express.Router();
const showDevCode = config.env !== 'production';

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await service.register(req.body));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getAccount(Number(req.params.id)));
  } catch (err) { next(err); }
});

router.post('/:id/otp', async (req, res, next) => {
  try {
    const { code, expiresAt } = await service.issueOtp(Number(req.params.id));
    res.status(201).json(showDevCode ? { expiresAt, devCode: code } : { expiresAt });
  } catch (err) { next(err); }
});

router.post('/:id/verify', async (req, res, next) => {
  try {
    res.json(await service.verifyOtp(Number(req.params.id), req.body && req.body.code));
  } catch (err) { next(err); }
});

// Simple HTML pages for the demo.
const pages = express.Router();

pages.get('/register', (req, res) => res.render('register', { error: null, account: null, devCode: null, values: {} }));

pages.post('/register', async (req, res) => {
  try {
    const account = await service.register(req.body);
    const { code } = await service.issueOtp(account.id);
    res.render('register', { error: null, account, devCode: showDevCode ? code : null, values: {} });
  } catch (err) {
    res.status(err.status || 500).render('register', { error: err.message, account: null, devCode: null, values: req.body });
  }
});

pages.post('/register/verify', async (req, res) => {
  const id = Number(req.body.accountId);
  try {
    const account = await service.verifyOtp(id, req.body.code);
    res.render('register', { error: null, account, devCode: null, values: {} });
  } catch (err) {
    const account = await service.getAccount(id).catch(() => null);
    res.status(err.status || 500).render('register', { error: err.message, account, devCode: null, values: {} });
  }
});

module.exports = { basePath: '/api/accounts', router, pages };
