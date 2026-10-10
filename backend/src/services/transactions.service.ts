import type { PaymentMethod, Prisma, Role, TransactionStatus } from '@prisma/client';
import { type checkoutSchema, calculateTotals, formatRupiah } from '@pos/shared';
import type { z } from 'zod';
import { logActivity } from '../lib/activity';
import { dateKey } from '../lib/dates';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { Prisma as PrismaNS, prisma } from '../lib/prisma';
import type { AuthUser } from '../middleware/auth';
import { type Pagination, paginate, paginated } from '../validators/common';
import { getSettings } from './settings.service';

export type CheckoutData = z.output<typeof checkoutSchema>;

const detailInclude = {
  cashier: { select: { id: true, name: true } },
  voidedBy: { select: { id: true, name: true } },
  items: { orderBy: { id: 'asc' } },
  payments: { orderBy: { id: 'asc' } },
} satisfies Prisma.TransactionInclude;

type TransactionDetail = Prisma.TransactionGetPayload<{ include: typeof detailInclude }>;

/** Hides cost/profit data from cashiers. */
function serializeTransaction(t: TransactionDetail, role: Role) {
  if (role === 'ADMIN') return t;
  const { totalCost: _tc, ...rest } = t;
  void _tc;
  return { ...rest, items: t.items.map(({ purchasePrice: _pp, ...item }) => (void _pp, item)) };
}

/**
 * Next number for the day: INV-YYYYMMDD-XXXX. The atomic upsert takes a row
 * lock on the day's counter, so concurrent checkouts get distinct numbers and
 * the counter rolls back together with a failed checkout (no gaps).
 */
async function nextTransactionNumber(tx: Prisma.TransactionClient, timeZone: string, now: Date) {
  const key = dateKey(now, timeZone);
  const [row] = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "DailySequence" ("date", "last") VALUES (${key}, 1)
    ON CONFLICT ("date") DO UPDATE SET "last" = "DailySequence"."last" + 1
    RETURNING "last"`;
  return `INV-${key}-${String(row.last).padStart(4, '0')}`;
}

/**
 * Completes a sale atomically. Inside ONE database transaction it:
 *   1. locks the products being sold and validates stock,
 *   2. computes totals from current DB prices (never trusting client prices),
 *   3. validates the payment,
 *   4. creates the transaction, its items (with price snapshots) and payment,
 *   5. deducts stock and writes inventory movements,
 *   6. writes the audit log.
 * Any failure rolls back every step.
 */
export async function checkout(input: CheckoutData, cashier: AuthUser) {
  if (input.clientRef) {
    const existing = await findByClientRef(input.clientRef, cashier);
    if (existing) return existing;
  }

  try {
    const id = await prisma.$transaction(
      async (tx) => {
        const settings = await getSettings(tx);
        const productIds = input.items.map((i) => i.productId).sort((a, b) => a - b);

        // Row locks (in id order to avoid deadlocks) prevent two cashiers overselling the same stock.
        const products = await tx.$queryRaw<
          {
            id: number;
            name: string;
            sku: string;
            unit: string;
            sellingPrice: number;
            purchasePrice: number;
            stock: number;
            isActive: boolean;
          }[]
        >`SELECT id, name, sku, unit, "sellingPrice", "purchasePrice", stock, "isActive"
          FROM "Product" WHERE id = ANY(${productIds}::int[]) ORDER BY id FOR UPDATE`;
        const byId = new Map(products.map((p) => [p.id, p]));

        const lines = input.items.map((item) => {
          const product = byId.get(item.productId);
          if (!product) throw badRequest('A product in the cart no longer exists.', 'PRODUCT_NOT_FOUND', { productId: item.productId });
          if (!product.isActive) {
            throw badRequest(`"${product.name}" is no longer available for sale.`, 'PRODUCT_INACTIVE', { productId: product.id });
          }
          if (product.stock < item.quantity) {
            throw conflict(
              product.stock === 0
                ? `"${product.name}" is out of stock.`
                : `Insufficient stock for "${product.name}". Only ${product.stock} left.`,
              'INSUFFICIENT_STOCK',
              { productId: product.id, available: product.stock },
            );
          }
          return { product, quantity: item.quantity };
        });

        const totals = calculateTotals({
          items: lines.map((l) => ({
            unitPrice: l.product.sellingPrice,
            purchasePrice: l.product.purchasePrice,
            quantity: l.quantity,
          })),
          discountType: input.discountType,
          discountValue: input.discountValue,
          taxRate: settings.taxEnabled ? settings.taxRate : 0,
        });

        if (input.expectedTotal !== undefined && input.expectedTotal !== totals.total) {
          throw conflict(
            `Prices have changed. The new total is ${formatRupiah(totals.total)}. Please review the cart.`,
            'TOTAL_CHANGED',
            { total: totals.total },
          );
        }

        const { method, amount, reference } = input.payment;
        let amountPaid: number;
        if (method === 'CASH') {
          if (amount < totals.total) throw badRequest('Insufficient payment amount.', 'INSUFFICIENT_PAYMENT', { total: totals.total });
          amountPaid = amount;
        } else {
          // Card / transfer / QRIS payments are for the exact amount.
          if (amount !== totals.total) {
            throw badRequest(
              `Non-cash payments must equal the total (${formatRupiah(totals.total)}).`,
              'INVALID_PAYMENT_AMOUNT',
              { total: totals.total },
            );
          }
          amountPaid = totals.total;
        }

        const now = new Date();
        const number = await nextTransactionNumber(tx, settings.timezone, now);
        const discountApplied = totals.discountAmount > 0;

        const transaction = await tx.transaction.create({
          data: {
            number,
            clientRef: input.clientRef,
            cashierId: cashier.id,
            subtotal: totals.subtotal,
            discountType: discountApplied ? input.discountType : null,
            discountValue: discountApplied ? input.discountValue : 0,
            discountAmount: totals.discountAmount,
            taxRate: settings.taxEnabled ? settings.taxRate : 0,
            taxAmount: totals.taxAmount,
            total: totals.total,
            totalCost: totals.totalCost,
            amountPaid,
            change: amountPaid - totals.total,
            itemCount: totals.itemCount,
            note: input.note,
            createdAt: now,
            items: {
              create: lines.map((l) => ({
                productId: l.product.id,
                productName: l.product.name,
                sku: l.product.sku,
                unit: l.product.unit,
                unitPrice: l.product.sellingPrice,
                purchasePrice: l.product.purchasePrice,
                quantity: l.quantity,
                subtotal: l.product.sellingPrice * l.quantity,
              })),
            },
            payments: { create: { method, amount: amountPaid, reference } },
          },
          select: { id: true, number: true },
        });

        for (const line of lines) {
          // Conditional decrement: a second guard (with the DB CHECK constraint) against negative stock.
          const result = await tx.product.updateMany({
            where: { id: line.product.id, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity } },
          });
          if (result.count !== 1) {
            throw conflict(`Insufficient stock for "${line.product.name}".`, 'INSUFFICIENT_STOCK', {
              productId: line.product.id,
            });
          }
        }

        await tx.inventoryMovement.createMany({
          data: lines.map((l) => ({
            productId: l.product.id,
            type: 'SALE' as const,
            quantityChange: -l.quantity,
            previousStock: l.product.stock,
            newStock: l.product.stock - l.quantity,
            reason: `Sale ${number}`,
            userId: cashier.id,
            transactionId: transaction.id,
          })),
        });

        await logActivity(tx, {
          userId: cashier.id,
          action: 'TRANSACTION_COMPLETED',
          entity: 'Transaction',
          entityId: transaction.id,
          description: `${cashier.name} completed transaction ${number} (${formatRupiah(totals.total)})`,
        });

        return transaction.id;
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    return getTransaction(id, cashier);
  } catch (err) {
    // Same clientRef submitted twice concurrently: return the sale that won.
    if (
      input.clientRef &&
      err instanceof PrismaNS.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      String(err.meta?.target).includes('clientRef')
    ) {
      const existing = await findByClientRef(input.clientRef, cashier);
      if (existing) return existing;
    }
    throw err;
  }
}

async function findByClientRef(clientRef: string, user: AuthUser) {
  const existing = await prisma.transaction.findUnique({ where: { clientRef }, select: { id: true, cashierId: true } });
  if (!existing) return null;
  if (existing.cashierId !== user.id) throw conflict('Duplicate checkout reference.', 'DUPLICATE_REFERENCE');
  return getTransaction(existing.id, user);
}

export async function getTransaction(id: number, user: AuthUser) {
  const t = await prisma.transaction.findUnique({ where: { id }, include: detailInclude });
  if (!t) throw notFound('Transaction not found.');
  if (user.role !== 'ADMIN' && t.cashierId !== user.id) throw forbidden('You can only view your own transactions.');
  return serializeTransaction(t, user.role);
}

export interface TransactionListQuery extends Pagination {
  search?: string;
  from?: Date;
  to?: Date;
  cashierId?: number;
  paymentMethod?: PaymentMethod;
  status?: TransactionStatus;
}

export function transactionWhere(q: Omit<TransactionListQuery, 'page' | 'pageSize'>, user: AuthUser) {
  const where: Prisma.TransactionWhereInput = {
    // Cashiers only ever see their own sales
    cashierId: user.role === 'ADMIN' ? q.cashierId : user.id,
    status: q.status,
    createdAt: q.from || q.to ? { gte: q.from, lt: q.to } : undefined,
    ...(q.paymentMethod ? { payments: { some: { method: q.paymentMethod } } } : {}),
    ...(q.search ? { number: { contains: q.search.trim(), mode: 'insensitive' } } : {}),
  };
  return where;
}

export async function listTransactions(q: TransactionListQuery, user: AuthUser) {
  const where = transactionWhere(q, user);
  const [rows, total, sums] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        number: true,
        status: true,
        itemCount: true,
        total: true,
        createdAt: true,
        cashier: { select: { id: true, name: true } },
        payments: { select: { method: true } },
      },
      ...paginate(q),
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where: { ...where, status: 'COMPLETED' }, _sum: { total: true } }),
  ]);
  const data = rows.map(({ payments, ...t }) => ({ ...t, paymentMethods: [...new Set(payments.map((p) => p.method))] }));
  return { ...paginated(data, total, q), totalAmount: sums._sum.total ?? 0 };
}

/** Voids a completed sale and returns its items to stock (admin only). */
export async function voidTransaction(id: number, reason: string, admin: AuthUser) {
  await prisma.$transaction(
    async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: number; status: TransactionStatus; number: string }[]>`
        SELECT id, status, number FROM "Transaction" WHERE id = ${id} FOR UPDATE`;
      if (!locked) throw notFound('Transaction not found.');
      if (locked.status === 'VOIDED') throw conflict('This transaction has already been voided.', 'ALREADY_VOIDED');

      const items = await tx.transactionItem.findMany({ where: { transactionId: id } });
      const ids = [...new Set(items.map((i) => i.productId))].sort((a, b) => a - b);
      const products = await tx.$queryRaw<{ id: number; stock: number }[]>`
        SELECT id, stock FROM "Product" WHERE id = ANY(${ids}::int[]) ORDER BY id FOR UPDATE`;
      const stock = new Map(products.map((p) => [p.id, p.stock]));

      for (const item of items) {
        const previous = stock.get(item.productId);
        if (previous === undefined) throw new AppError(500, 'Product missing while voiding.');
        const next = previous + item.quantity;
        stock.set(item.productId, next);
        await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: 'VOID_RETURN',
            quantityChange: item.quantity,
            previousStock: previous,
            newStock: next,
            reason: `Void ${locked.number}: ${reason}`,
            userId: admin.id,
            transactionId: id,
          },
        });
      }

      await tx.transaction.update({
        where: { id },
        data: { status: 'VOIDED', voidedAt: new Date(), voidedById: admin.id, voidReason: reason },
      });
      await logActivity(tx, {
        userId: admin.id,
        action: 'TRANSACTION_VOIDED',
        entity: 'Transaction',
        entityId: id,
        description: `${admin.name} voided transaction ${locked.number} (${reason})`,
      });
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  return getTransaction(id, admin);
}
