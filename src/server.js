'use strict';
const { createApp } = require('./app');
const { config } = require('./config');
const logger = require('./logger');

const app = createApp();
app.listen(config.port, () => logger.info(`Railway Reservation System listening on port ${config.port}`));
