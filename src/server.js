'use strict';
const http = require('http');
const https = require('https');
const { createApp } = require('./app');
const { config } = require('./config');
const logger = require('./logger');
const { releaseExpiredHolds } = require('./modules/booking/service');
const { tlsOptions, redirectHandler, withHsts } = require('./tls');
const { dispatchPending } = require('./modules/notification/service');
const { prepareDueCharts } = require('./modules/chart/service');

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

// Prepare charts whose time has come, once a minute (RRS-F-017).
setInterval(() => {
  prepareDueCharts()
    .then((done) => { if (done.length) logger.info({ runs: done.map((d) => d.runId) }, 'Charts prepared'); })
    .catch((err) => logger.error({ err }, 'Chart preparation failed'));
}, 60000).unref();

// Send anything waiting in the notification outbox every 30 seconds, so a
// message that failed earlier is retried even if nothing else happens (ADR-03).
setInterval(() => {
  dispatchPending()
    .then((n) => { if (n) logger.info({ sent: n }, 'Queued notifications sent'); })
    .catch((err) => logger.error({ err }, 'Notification dispatch failed'));
}, 30000).unref();
