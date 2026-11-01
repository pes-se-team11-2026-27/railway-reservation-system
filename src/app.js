'use strict';
const path = require('path');
const express = require('express');
const correlationId = require('./middleware/correlationId');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(correlationId);
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/', (req, res) => res.render('index'));
  app.use('/health', healthRoutes);

  // Feature modules mount their routers here as they land, for example:
  // app.use('/api/accounts', require('./modules/account/routes'));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
