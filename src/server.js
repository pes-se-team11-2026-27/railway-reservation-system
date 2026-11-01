'use strict';
const { createApp } = require('./app');
const { config } = require('./config');
const logger = require('./logger');
const { releaseExpiredHolds } = require('./modules/booking/service');

const app = createApp();
app.listen(config.port, () => logger.info(`Railway Reservation System listening on port ${config.port}`));

// Free the berths of lapsed holds once a minute (RRS-F-006).
setInterval(() => {
  releaseExpiredHolds()
    .then((n) => { if (n) logger.info({ released: n }, 'Expired holds released'); })
    .catch((err) => logger.error({ err }, 'Expired hold sweep failed'));
}, 60000).unref();
