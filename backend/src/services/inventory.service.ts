import type { MovementType, Prisma } from '@prisma/client';
import type { InventoryAdjustmentInput } from '@pos/shared';
import { logActivity } from '../lib/activity';
import { badRequest, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import type { AuthUser } from '../middleware/auth';
import { type Pagination, paginate, paginated } from '../validators/common';

interface LockedProduct {
  id: number;
  name: string;
  stock: number;
}

/** Locks product rows (in id order, to avoid deadlocks) for the rest of the transaction. */
export async function lockProducts(tx: Prisma.TransactionClient, ids: number[]): Promise<Map<number, LockedProduct>> {
  if (ids.length === 0) return new Map();
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const rows = await tx.$queryRaw<LockedProduct[]>`
    SELECT id, name, stock FROM "Product" WHERE id = ANY(${sorted}::int[]) ORDER BY id FOR UPDATE`;
  return new Map(rows.map((r) => [r.id, r]));
}

/** Sets a product's stock and records the movement. Throws if the result would be negative. */
async function applyStockChange(
  tx: Prisma.TransactionClient,
  product: LockedProduct,
  newStock: number,
  type: MovementType,
  reason: string | null,
  userId: number,
) {
  if (newStock < 0) {
    throw badRequest(
      `Not enough stock for "${product.name}". Current stock is ${product.stock}.`,
      'INSUFFICIENT_STOCK',
      { productId: product.id, available: product.stock },
    );
  }
  await tx.product.update({ where: { id: product.id }, data: { stock: newStock } });
  return tx.inventoryMovement.create({
    data: {
      productId: product.id,
      type,
      quantityChange: newStock - product.stock,
      previousStock: product.stock,
      newStock,
      reason,
      userId,
    },
  });
}

const KIND_TO_TYPE = { ADD: 'RESTOCK', REMOVE: 'REMOVE', SET: 'ADJUSTMENT' } as const;

export async function adjustStock(input: InventoryAdjustmentInput, actor: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const product = (await lockProducts(tx, [input.productId])).get(input.productId);
    if (!product) throw notFound('Product not found.');

    const newStock =
      input.kind === 'ADD'
        ? product.stock + input.quantity
        : input.kind === 'REMOVE'
          ? product.stock - input.quantity
          : input.quantity;
    if (input.kind === 'SET' && newStock === product.stock) {
      throw badRequest(`Stock of "${product.name}" is already ${newStock}.`, 'NO_CHANGE');
    }

    const movement = await applyStockChange(tx, product, newStock, KIND_TO_TYPE[input.kind], input.reason, actor.id);
    const delta = movement.quantityChange;
    const verb =
      input.kind === 'ADD'
        ? `added ${delta} units of`
        : input.kind === 'REMOVE'
          ? `removed ${-delta} units of`
          : `adjusted stock of`;
    await logActivity(tx, {
      userId: actor.id,
      action: `STOCK_${input.kind}`,
      entity: 'Product',
      entityId: product.id,
      description: `${actor.name} ${verb} "${product.name}" (${movement.previousStock} → ${movement.newStock}, ${input.reason})`,
    });
    return movement;
  });
}

/** Stock opname: records physically counted quantities for many products at once. */
export async function stockOpname(
  input: { items: { productId: number; countedStock: number }[]; note: string | null },
  actor: AuthUser,
) {
  return prisma.$transaction(
    async (tx) => {
      const locked = await lockProducts(
        tx,
        input.items.map((i) => i.productId),
      );
      let changed = 0;
      const reason = input.note ? `Stock opname: ${input.note}` : 'Stock opname';
      for (const item of input.items) {
        const product = locked.get(item.productId);
        if (!product) throw notFound(`Product #${item.productId} not found.`);
        if (product.stock === item.countedStock) continue;
        await applyStockChange(tx, product, item.countedStock, 'OPNAME', reason, actor.id);
        changed++;
      }
      await logActivity(tx, {
        userId: actor.id,
        action: 'STOCK_OPNAME',
        entity: 'Inventory',
        description: `${actor.name} completed a stock opname (${input.items.length} counted, ${changed} corrected)`,
      });
      return { counted: input.items.length, corrected: changed };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

export interface MovementQuery extends Pagination {
  productId?: number;
  type?: MovementType;
  from?: Date;
  to?: Date;
}

export async function listMovements(q: MovementQuery) {
  const where: Prisma.InventoryMovementWhereInput = {
    productId: q.productId,
    type: q.type,
    createdAt: q.from || q.to ? { gte: q.from, lt: q.to } : undefined,
  };
  const [rows, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        product: { select: { id: true, name: true, sku: true } },
        user: { select: { id: true, name: true } },
        transaction: { select: { id: true, number: true } },
      },
      ...paginate(q),
    }),
    prisma.inventoryMovement.count({ where }),
  ]);
  return paginated(rows, total, q);
}
