'use strict';
const logger = require('../logger');
const { AppError } = require('../errors');

function notFoundHandler(req, res) {
  // Browsers get a page; API clients (and anything that did not ask for HTML) get JSON.
  if (req.accepts(['json', 'html']) === 'html') return res.status(404).render('not-found');
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' }, correlationId: req.correlationId });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message }, correlationId: req.correlationId });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' }, correlationId: req.correlationId });
  }
  logger.error({ err, correlationId: req.correlationId }, 'Unhandled error');
  // No stack trace goes back to the client (SAD 4.4).
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' }, correlationId: req.correlationId });
}

module.exports = { notFoundHandler, errorHandler };
