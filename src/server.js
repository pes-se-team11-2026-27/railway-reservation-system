'use strict';
const http = require('http');
const https = require('https');
const { createApp } = require('./app');
const { config } = require('./config');
const logger = require('./logger');
const { releaseExpiredHolds } = require('./modules/booking/service');
const { tlsOptions, redirectHandler, withHsts } = require('./tls');

const app = createApp();

if (config.tlsEnabled) {
  // RRS-SR-001: HTTPS only. Plain HTTP answers with a redirect and nothing else.
  https.createServer(tlsOptions({ certPath: config.tlsCert, keyPath: config.tlsKey }), withHsts(app))
    .listen(config.httpsPort, () => logger.info(`HTTPS on port ${config.httpsPort}`));
  http.createServer(redirectHandler(config.httpsPort))
    .listen(config.port, () => logger.info(`HTTP on port ${config.port} redirects to HTTPS`));
} else {
  app.listen(config.port, () => logger.info(`Railway Reservation System listening on port ${config.port}`));
}

// Free the berths of lapsed holds once a minute (RRS-F-006).
setInterval(() => {
  releaseExpiredHolds()
    .then((n) => { if (n) logger.info({ released: n }, 'Expired holds released'); })
    .catch((err) => logger.error({ err }, 'Expired hold sweep failed'));
}, 60000).unref();
