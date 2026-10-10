import bcrypt from 'bcryptjs';
import type { Prisma, Role, User } from '@prisma/client';
import type { userCreateSchema, userUpdateSchema } from '@pos/shared';
import type { z } from 'zod';
import { env } from '../config/env';
import { logActivity } from '../lib/activity';
import { badRequest, conflict, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import type { AuthUser } from '../middleware/auth';
import { type Pagination, paginate, paginated } from '../validators/common';

/** Public user fields — the password hash and token version never leave the server. */
export const publicUserSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export function hashPassword(password: string) {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function listUsers(q: Pagination & { search?: string; role?: Role; isActive?: boolean }) {
  const where: Prisma.UserWhereInput = {
    role: q.role,
    isActive: q.isActive,
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { username: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: publicUserSelect, orderBy: { name: 'asc' }, ...paginate(q) }),
    prisma.user.count({ where }),
  ]);
  return paginated(rows, total, q);
}

/** Lightweight list used for filter dropdowns (e.g. cashier filter on transactions). */
export function listUserOptions() {
  return prisma.user.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } });
}

export async function createUser(data: z.output<typeof userCreateSchema>, actor: AuthUser) {
  const passwordHash = await hashPassword(data.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: data.name,
        username: data.username,
        email: data.email,
        role: data.role,
        isActive: data.isActive,
        passwordHash,
      },
      select: publicUserSelect,
    });
    await logActivity(tx, {
      userId: actor.id,
      action: 'USER_CREATED',
      entity: 'User',
      entityId: user.id,
      description: `${actor.name} created ${user.role.toLowerCase()} account "${user.username}"`,
    });
    return user;
  });
}

async function assertNotLastAdmin(tx: Prisma.TransactionClient, target: User) {
  if (target.role !== 'ADMIN' || !target.isActive) return;
  const activeAdmins = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
  if (activeAdmins <= 1) throw conflict('At least one active administrator is required.');
}

export async function updateUser(id: number, data: z.output<typeof userUpdateSchema>, actor: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id } });
    if (!existing) throw notFound('User not found.');

    const demoting = existing.role === 'ADMIN' && data.role !== 'ADMIN';
    const deactivating = existing.isActive && !data.isActive;
    if (id === actor.id && (demoting || deactivating)) {
      throw badRequest('You cannot remove your own administrator access or deactivate yourself.');
    }
    if (demoting || deactivating) await assertNotLastAdmin(tx, existing);

    const user = await tx.user.update({
      where: { id },
      data: {
        name: data.name,
        username: data.username,
        email: data.email,
        role: data.role,
        isActive: data.isActive,
        // Role or status changes revoke existing sessions
        ...(demoting || deactivating || existing.role !== data.role ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: publicUserSelect,
    });

    const changes: string[] = [];
    if (existing.role !== user.role) changes.push(`role ${existing.role} → ${user.role}`);
    if (existing.isActive !== user.isActive) changes.push(user.isActive ? 'activated' : 'deactivated');
    if (existing.username !== user.username) changes.push(`username "${existing.username}" → "${user.username}"`);
    await logActivity(tx, {
      userId: actor.id,
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: id,
      description: `${actor.name} updated user "${user.username}"${changes.length ? ` (${changes.join(', ')})` : ''}`,
    });
    return user;
  });
}

export async function setUserStatus(id: number, isActive: boolean, actor: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id } });
    if (!existing) throw notFound('User not found.');
    if (!isActive && id === actor.id) throw badRequest('You cannot deactivate your own account.');
    if (!isActive) await assertNotLastAdmin(tx, existing);

    const user = await tx.user.update({
      where: { id },
      data: { isActive, ...(isActive ? {} : { tokenVersion: { increment: 1 } }) },
      select: publicUserSelect,
    });
    await logActivity(tx, {
      userId: actor.id,
      action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entity: 'User',
      entityId: id,
      description: `${actor.name} ${isActive ? 'activated' : 'deactivated'} user "${user.username}"`,
    });
    return user;
  });
}

export async function resetPassword(id: number, password: string, actor: AuthUser) {
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id } });
    if (!existing) throw notFound('User not found.');
    // Bumping tokenVersion signs the user out everywhere.
    await tx.user.update({ where: { id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    await logActivity(tx, {
      userId: actor.id,
      action: 'USER_PASSWORD_RESET',
      entity: 'User',
      entityId: id,
      description: `${actor.name} reset the password of "${existing.username}"`,
    });
  });
}
