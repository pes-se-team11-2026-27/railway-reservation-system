'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const correlationId = require('./middleware/correlationId');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');
const { loadSession } = require('./modules/auth/session');

// Every folder in src/modules that has a routes.js is mounted automatically.
// routes.js exports { basePath, router } and optionally { pages } for HTML pages.
// This way each feature adds its own folder and nobody edits this file.
function mountModules(app) {
  const modulesDir = path.join(__dirname, 'modules');
  if (!fs.existsSync(modulesDir)) return;
  for (const name of fs.readdirSync(modulesDir).sort()) {
    const routesFile = path.join(modulesDir, name, 'routes.js');
    if (!fs.existsSync(routesFile)) continue;
    const mod = require(routesFile);
    if (mod.pages) app.use('/', mod.pages);
    if (mod.router) app.use(mod.basePath, mod.router);
  }
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(correlationId);
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // The most frequent job, finding a train, is the home page.
  // Who is signed in, if anyone (RRS-SR-003). Runs before every route.
  app.use(loadSession);
  app.get('/', (req, res) => res.redirect('/search'));
  app.use('/health', healthRoutes);
  mountModules(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
