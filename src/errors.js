'use strict';

// Every module throws AppError for expected failures. The error middleware
// turns it into a clean HTTP response; anything else becomes a 500.
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

const badRequest = (code, message) => new AppError(400, code, message);
const notFound = (code, message) => new AppError(404, code, message);
const conflict = (code, message) => new AppError(409, code, message);

module.exports = { AppError, badRequest, notFound, conflict };
