const logger = require('../config/logger');

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

const errorHandler = (err, req, res, _next) => {
  let error = err;

  if (!error.isOperational && error.code === '23505') {
    const field = error.detail?.match(/\(([^)]+)\)/)?.[1] || 'value';
    error = new AppError(`Duplicate ${field} already exists`, 400, 'DUPLICATE', { field });
  } else if (!error.isOperational && error.code === '23503') {
    error = new AppError('Referenced record not found', 400, 'FOREIGN_KEY');
  } else if (!error.isOperational && error.code === '42703') {
    error = new AppError('Database schema is out of date — run migrations', 500, 'SCHEMA_OUTDATED');
  }

  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';

  logger.error('Request error', {
    message: err.message,
    statusCode,
    code,
    path: req.path,
    method: req.method,
    stack: err.stack,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: error.isOperational
        ? error.message
        : (process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'),
      ...(error.details && { details: error.details }),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    },
  });
};

const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
};

module.exports = { AppError, errorHandler, notFound };
