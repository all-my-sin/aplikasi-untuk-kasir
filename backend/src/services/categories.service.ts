import type { Prisma } from '@prisma/client';
import type { CategoryData } from '@pos/shared';
import { logActivity } from '../lib/activity';
import { conflict, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import type { AuthUser } from '../middleware/auth';

export async function listCategories(q: { search?: string; isActive?: boolean }) {
  const where: Prisma.CategoryWhereInput = {
    isActive: q.isActive,
    ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
  };
  const rows = await prisma.category.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  return rows.map(({ _count, ...c }) => ({ ...c, productCount: _count.products }));
}

export async function createCategory(data: CategoryData, actor: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.category.create({ data });
    await logActivity(tx, {
      userId: actor.id,
      action: 'CATEGORY_CREATED',
      entity: 'Category',
      entityId: category.id,
      description: `${actor.name} created category "${category.name}"`,
    });
    return category;
  });
}

export async function updateCategory(id: number, data: CategoryData, actor: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.category.findUnique({ where: { id } });
    if (!existing) throw notFound('Category not found.');
    const category = await tx.category.update({ where: { id }, data });
    const renamed = existing.name !== category.name ? ` (renamed from "${existing.name}")` : '';
    await logActivity(tx, {
      userId: actor.id,
      action: 'CATEGORY_UPDATED',
      entity: 'Category',
      entityId: id,
      description: `${actor.name} updated category "${category.name}"${renamed}`,
    });
    return category;
  });
}

export async function deleteCategory(id: number, actor: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) throw notFound('Category not found.');
    if (existing._count.products > 0) {
      throw conflict(
        `"${existing.name}" still has ${existing._count.products} product(s). Move them to another category or deactivate the category instead.`,
        'CATEGORY_IN_USE',
      );
    }
    await tx.category.delete({ where: { id } });
    await logActivity(tx, {
      userId: actor.id,
      action: 'CATEGORY_DELETED',
      entity: 'Category',
      entityId: id,
      description: `${actor.name} deleted category "${existing.name}"`,
    });
  });
}
