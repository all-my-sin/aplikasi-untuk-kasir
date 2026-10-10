// Users, settings, uploads and activity-log handlers.
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  ROLES,
  passwordResetSchema,
  settingsSchema,
  userCreateSchema,
  userStatusSchema,
  userUpdateSchema,
} from '@pos/shared';
import { badRequest } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { currentUser } from '../middleware/auth';
import * as settings from '../services/settings.service';
import * as users from '../services/users.service';
import { dateRangeQuery, idParam, optionalBool, paginate, paginated, paginationQuery } from '../validators/common';

// ---------------------------------------------------------------- users
export async function listUsers(req: Request, res: Response) {
  const q = paginationQuery
    .extend({ search: z.string().trim().max(100).optional(), role: z.enum(ROLES).optional(), isActive: optionalBool })
    .parse(req.query);
  res.json(await users.listUsers(q));
}

export async function userOptions(_req: Request, res: Response) {
  res.json(await users.listUserOptions());
}

export async function createUser(req: Request, res: Response) {
  res.status(201).json(await users.createUser(userCreateSchema.parse(req.body), currentUser(req)));
}

export async function updateUser(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  res.json(await users.updateUser(id, userUpdateSchema.parse(req.body), currentUser(req)));
}

export async function setUserStatus(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const { isActive } = userStatusSchema.parse(req.body);
  res.json(await users.setUserStatus(id, isActive, currentUser(req)));
}

export async function resetPassword(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const { password } = passwordResetSchema.parse(req.body);
  await users.resetPassword(id, password, currentUser(req));
  res.json({ ok: true });
}

// ---------------------------------------------------------------- settings
export async function getSettings(_req: Request, res: Response) {
  res.json(await settings.getSettings());
}

export async function updateSettings(req: Request, res: Response) {
  res.json(await settings.updateSettings(settingsSchema.parse(req.body), currentUser(req)));
}

// ---------------------------------------------------------------- uploads
export function uploadImage(req: Request, res: Response) {
  if (!req.file) throw badRequest('Choose an image file (PNG, JPG, WEBP or GIF).');
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
}

// ---------------------------------------------------------------- activity log
export async function activityLogs(req: Request, res: Response) {
  const q = paginationQuery
    .extend({
      userId: z.coerce.number().int().positive().optional(),
      entity: z.string().trim().max(50).optional(),
      search: z.string().trim().max(100).optional(),
    })
    .and(dateRangeQuery)
    .parse(req.query);
  const where: Prisma.ActivityLogWhereInput = {
    userId: q.userId,
    entity: q.entity,
    createdAt: q.from || q.to ? { gte: q.from, lt: q.to } : undefined,
    ...(q.search ? { description: { contains: q.search, mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { user: { select: { id: true, name: true, username: true } } },
      ...paginate(q),
    }),
    prisma.activityLog.count({ where }),
  ]);
  res.json(paginated(rows, total, q));
}
