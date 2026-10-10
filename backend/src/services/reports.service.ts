import type { PaymentMethod } from '@prisma/client';
import {
  type BestSellerDTO,
  type DailySalesDTO,
  type PaymentBreakdownDTO,
  type SalesSummaryDTO,
  calculateMargin,
  getStockStatus,
} from '@pos/shared';
import { daysBetween } from '../lib/dates';
import { prisma } from '../lib/prisma';
import type { DateRange } from '../validators/common';
import { stockStatusWhere } from './products.service';

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

/**
 * Sales & profit summary for completed (non-voided) transactions in [from, to).
 *   netSales    = subtotal − discounts        (revenue, excluding tax)
 *   cogs        = Σ purchasePrice@sale × qty  (cost snapshot stored on each sale)
 *   itemProfit  = Σ (sellingPrice − purchasePrice) × qty   (before discounts)
 *   grossProfit = netSales − cogs = itemProfit − discounts
 */
export async function salesSummary({ from, to }: DateRange): Promise<SalesSummaryDTO> {
  const agg = await prisma.transaction.aggregate({
    where: { status: 'COMPLETED', createdAt: { gte: from, lt: to } },
    _count: { _all: true },
    _sum: { subtotal: true, discountAmount: true, taxAmount: true, total: true, totalCost: true, itemCount: true },
  });
  const transactions = agg._count._all;
  const grossSales = agg._sum.subtotal ?? 0;
  const discounts = agg._sum.discountAmount ?? 0;
  const netSales = grossSales - discounts;
  const cogs = agg._sum.totalCost ?? 0;
  const grossProfit = netSales - cogs;
  return {
    transactions,
    itemsSold: agg._sum.itemCount ?? 0,
    grossSales,
    discounts,
    netSales,
    tax: agg._sum.taxAmount ?? 0,
    totalCollected: agg._sum.total ?? 0,
    cogs,
    itemProfit: grossSales - cogs,
    grossProfit,
    margin: calculateMargin(grossProfit, netSales),
    averageTransaction: transactions ? Math.round(netSales / transactions) : 0,
  };
}

/** Revenue / transactions / profit per calendar day (in `tz`), with empty days filled in. */
export async function dailySales({ from, to }: DateRange, tz: string): Promise<DailySalesDTO[]> {
  const rows = await prisma.$queryRaw<{ day: string; transactions: number; revenue: bigint; profit: bigint }[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS transactions,
           SUM("subtotal" - "discountAmount")::bigint AS revenue,
           SUM("subtotal" - "discountAmount" - "totalCost")::bigint AS profit
    FROM "Transaction"
    WHERE "status" = 'COMPLETED' AND "createdAt" >= ${from} AND "createdAt" < ${to}
    GROUP BY day ORDER BY day`;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return daysBetween(from, to, tz).map((date) => {
    const r = byDay.get(date);
    return { date, transactions: r?.transactions ?? 0, revenue: num(r?.revenue), profit: num(r?.profit) };
  });
}

/** Top products by quantity sold. Uses price snapshots stored on each sale. */
export async function bestSellers({ from, to }: DateRange, limit = 10): Promise<BestSellerDTO[]> {
  const rows = await prisma.$queryRaw<
    { productId: number; name: string; sku: string; quantity: bigint; revenue: bigint; profit: bigint }[]
  >`
    SELECT ti."productId", p."name", p."sku",
           SUM(ti."quantity")::bigint AS quantity,
           SUM(ti."subtotal")::bigint AS revenue,
           SUM(ti."subtotal" - ti."purchasePrice" * ti."quantity")::bigint AS profit
    FROM "TransactionItem" ti
    JOIN "Transaction" t ON t."id" = ti."transactionId"
    JOIN "Product" p ON p."id" = ti."productId"
    WHERE t."status" = 'COMPLETED' AND t."createdAt" >= ${from} AND t."createdAt" < ${to}
    GROUP BY ti."productId", p."name", p."sku"
    ORDER BY quantity DESC, revenue DESC
    LIMIT ${limit}`;
  return rows.map((r, i) => ({
    rank: i + 1,
    productId: r.productId,
    name: r.name,
    sku: r.sku,
    quantity: num(r.quantity),
    revenue: num(r.revenue),
    profit: num(r.profit),
  }));
}

export async function paymentBreakdown({ from, to }: DateRange): Promise<PaymentBreakdownDTO[]> {
  const rows = await prisma.$queryRaw<{ method: PaymentMethod; transactions: number; amount: bigint }[]>`
    SELECT p."method", COUNT(DISTINCT p."transactionId")::int AS transactions, SUM(p."amount")::bigint AS amount
    FROM "Payment" p JOIN "Transaction" t ON t."id" = p."transactionId"
    WHERE t."status" = 'COMPLETED' AND t."createdAt" >= ${from} AND t."createdAt" < ${to}
    GROUP BY p."method" ORDER BY amount DESC`;
  return rows.map((r) => ({ method: r.method, transactions: r.transactions, amount: num(r.amount) }));
}

export async function cashierBreakdown({ from, to }: DateRange) {
  const rows = await prisma.$queryRaw<{ cashierId: number; name: string; transactions: number; revenue: bigint }[]>`
    SELECT t."cashierId", u."name", COUNT(*)::int AS transactions,
           SUM(t."subtotal" - t."discountAmount")::bigint AS revenue
    FROM "Transaction" t JOIN "User" u ON u."id" = t."cashierId"
    WHERE t."status" = 'COMPLETED' AND t."createdAt" >= ${from} AND t."createdAt" < ${to}
    GROUP BY t."cashierId", u."name" ORDER BY revenue DESC`;
  return rows.map((r) => ({ ...r, revenue: num(r.revenue) }));
}

export async function dashboard(today: DateRange) {
  const active = { isActive: true };
  const [summary, totalProducts, lowStockCount, outOfStockCount, lowStock] = await Promise.all([
    salesSummary(today),
    prisma.product.count({ where: active }),
    prisma.product.count({ where: { ...active, ...stockStatusWhere('LOW_STOCK') } }),
    prisma.product.count({ where: { ...active, ...stockStatusWhere('OUT_OF_STOCK') } }),
    prisma.product.findMany({
      where: { ...active, stock: { lte: prisma.product.fields.minStock } },
      select: { id: true, name: true, sku: true, stock: true, minStock: true, unit: true },
      orderBy: [{ stock: 'asc' }, { name: 'asc' }],
      take: 10,
    }),
  ]);
  return {
    today: summary,
    totalProducts,
    lowStockCount,
    outOfStockCount,
    lowStockProducts: lowStock.map((p) => ({ ...p, stockStatus: getStockStatus(p.stock, p.minStock) })),
  };
}

/** Rows for exporting transactions in a range (capped to keep exports reasonable). */
export async function transactionRows({ from, to }: DateRange, max = 50_000) {
  return prisma.transaction.findMany({
    where: { createdAt: { gte: from, lt: to } },
    orderBy: { createdAt: 'asc' },
    take: max,
    select: {
      number: true,
      createdAt: true,
      status: true,
      itemCount: true,
      subtotal: true,
      discountAmount: true,
      taxAmount: true,
      total: true,
      totalCost: true,
      cashier: { select: { name: true } },
      payments: { select: { method: true } },
    },
  });
}

