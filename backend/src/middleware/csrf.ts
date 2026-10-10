import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests: state-changing requests must
 * carry a custom header. Browsers refuse to send custom headers cross-origin
 * unless CORS explicitly allows that origin, so forged form posts are rejected.
 * (The SameSite=Lax session cookie is a second layer of protection.)
 */
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('x-requested-with') !== 'XMLHttpRequest') {
    return next(forbidden('Request blocked for security reasons. Please reload the page.'));
  }
  next();
}
