import type { Request, Response } from 'express';
import { loginSchema } from '@pos/shared';
import { unauthorized } from '../lib/errors';
import { SESSION_COOKIE, currentUser, sessionCookieOptions, signSession } from '../middleware/auth';
import * as auth from '../services/auth.service';

export async function login(req: Request, res: Response) {
  const { username, password } = loginSchema.parse(req.body);
  const { user, tokenVersion } = await auth.login(username, password);
  res.cookie(SESSION_COOKIE, signSession({ id: user.id, tokenVersion }), sessionCookieOptions());
  res.json({ user });
}

export function logout(_req: Request, res: Response) {
  const { maxAge: _m, ...options } = sessionCookieOptions();
  void _m;
  res.clearCookie(SESSION_COOKIE, options);
  res.json({ ok: true });
}

export async function me(req: Request, res: Response) {
  const user = await auth.getMe(currentUser(req).id);
  if (!user) throw unauthorized();
  res.json({ user });
}
