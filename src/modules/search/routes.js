'use strict';
const express = require('express');
const service = require('./service');

const router = express.Router();

router.get('/search', async (req, res, next) => {
  try {
    res.json(await service.searchTrains(req.query));
  } catch (err) { next(err); }
});

router.get('/:number/availability', async (req, res, next) => {
  try {
    res.json(await service.getAvailability({
      number: req.params.number, date: req.query.date, classCode: req.query.class, quotaCode: req.query.quota || 'GN',
    }));
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
        for (const t of trains) {
          t.availability = {};
          for (const c of t.classes) t.availability[c] = await service.availabilityForRun(t.runId, c, 'GN');
        }
      } catch (err) {
        if (!err.status) throw err;
        error = err.message;
      }
    }
    res.render('search', { stations, query, trains, error });
  } catch (err) { next(err); }
});

module.exports = { basePath: '/api/trains', router, pages };
