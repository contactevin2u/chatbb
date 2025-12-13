import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { BaseException } from '../exceptions/base.exception.js';

export function errorMiddleware(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error({ error: error.message, stack: error.stack }, 'Error occurred');

  if (error instanceof BaseException) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(error.details && { details: error.details }),
    });
    return;
  }

  // Default error response
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { message: error.message }),
  });
}
