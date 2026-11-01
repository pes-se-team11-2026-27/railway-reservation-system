'use strict';
const express = require('express');
const service = require('./service');

const router = express.Router();

router.get('/search', async (req, res, next) => {
  try {
    res.json(await service.searchTrains(req.query));
  } catch (err) { next(err); }
});

router.get('/stations', async (req, res, next) => {
  try {
    res.json(await service.listStations());
  } catch (err) { next(err); }
});

const pages = express.Router();

pages.get('/search', async (req, res, next) => {
  try {
    const stations = await service.listStations();
    const query = { from: req.query.from || '', to: req.query.to || '', date: req.query.date || '' };
    let trains = null;
    let error = null;
    if (query.from || query.to || query.date) {
      try {
        trains = await service.searchTrains(query);
      } catch (err) {
        if (!err.status) throw err;
        error = err.message;
      }
    }
    res.render('search', { stations, query, trains, error });
  } catch (err) { next(err); }
});

module.exports = { basePath: '/api/trains', router, pages };
