import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';

export const SESSION_COOKIE = 'pos_session';

export interface AuthUser {
  id: number;
  name: string;
  username: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

interface TokenPayload {
  sub: string;
  tv: number;
}

export function signSession(user: { id: number; tokenVersion: number }): string {
  return jwt.sign({ tv: user.tokenVersion } satisfies Omit<TokenPayload, 'sub'>, env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24, // the JWT's own expiry is authoritative
  };
}

/** Verifies the session cookie and loads the (still active) user. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || !token) return next(unauthorized());

  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
  } catch {
    return next(unauthorized('Your session has expired. Please sign in again.'));
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(payload.sub) },
    select: { id: true, name: true, username: true, role: true, isActive: true, tokenVersion: true },
  });
  // tokenVersion changes on password reset / deactivation, revoking old sessions.
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
    return next(unauthorized('Your session is no longer valid. Please sign in again.'));
  }
  req.user = { id: user.id, name: user.name, username: user.username, role: user.role };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export const requireAdmin = requireRole('ADMIN');

/** Returns the authenticated user (routes using this are behind `authenticate`). */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
