import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { Prisma } from '../lib/prisma';

const FIELD_LABELS: Record<string, string> = {
  sku: 'SKU',
  barcode: 'barcode',
  username: 'username',
  email: 'email',
  name: 'name',
  number: 'transaction number',
};

function uniqueFieldMessage(target: unknown): string {
  const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  const field = fields.map(String).find((f) => FIELD_LABELS[f]);
  return field ? `This ${FIELD_LABELS[field]} is already in use.` : 'A record with these details already exists.';
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: 'Not found.', code: 'NOT_FOUND' } });
}

/**
 * Converts every error into a friendly JSON response. Raw technical errors
 * (Prisma, SQL, stack traces) are logged on the server and never sent to users.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code, ...err.details } });
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    const first = Object.values(fields)[0];
    return res.status(400).json({
      error: { message: first ?? 'Please check the submitted information.', code: 'VALIDATION_ERROR', fields },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res
        .status(409)
        .json({ error: { message: uniqueFieldMessage(err.meta?.target), code: 'DUPLICATE', target: err.meta?.target } });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { message: 'The requested item was not found.', code: 'NOT_FOUND' } });
    }
    if (err.code === 'P2003') {
      return res
        .status(409)
        .json({ error: { message: 'This item is referenced by other records and cannot be changed.', code: 'IN_USE' } });
    }
    if (err.code === 'P2034') {
      return res
        .status(409)
        .json({ error: { message: 'The system is busy. Please try again.', code: 'WRITE_CONFLICT' } });
    }
  }

  if (err instanceof MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large (maximum 2 MB).' : 'The upload failed.';
    return res.status(400).json({ error: { message, code: 'UPLOAD_ERROR' } });
  }

  // body-parser errors (malformed JSON, payload too large)
  const httpErr = err as { type?: string; status?: number };
  if (httpErr?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'The request body is not valid JSON.', code: 'BAD_JSON' } });
  }
  if (httpErr?.type === 'entity.too.large') {
    return res.status(413).json({ error: { message: 'The request is too large.', code: 'TOO_LARGE' } });
  }

  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, err);
  return res
    .status(500)
    .json({ error: { message: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' } });
}
