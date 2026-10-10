import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../lib/errors';
import * as exporter from '../services/export.service';
import * as reports from '../services/reports.service';
import { getSettings } from '../services/settings.service';
import { dateRangeQuery, requireRange } from '../validators/common';

async function rangeAndZone(req: Request) {
  const q = dateRangeQuery.parse(req.query);
  const range = requireRange(q);
  const tz = q.tz ?? (await getSettings()).timezone;
  return { range, tz };
}

export async function dashboard(req: Request, res: Response) {
  const { range } = await rangeAndZone(req);
  res.json(await reports.dashboard(range));
}

export async function sales(req: Request, res: Response) {
  const { range, tz } = await rangeAndZone(req);
  if (range.to.getTime() - range.from.getTime() > 400 * 86_400_000) {
    throw badRequest('Daily breakdowns are limited to 400 days. Choose a shorter range.');
  }
  const [summary, daily, payments, cashiers] = await Promise.all([
    reports.salesSummary(range),
    reports.dailySales(range, tz),
    reports.paymentBreakdown(range),
    reports.cashierBreakdown(range),
  ]);
  res.json({ summary, daily, payments, cashiers });
}

export async function profit(req: Request, res: Response) {
  const { range } = await rangeAndZone(req);
  const s = await reports.salesSummary(range);
  res.json({
    revenue: s.netSales,
    cogs: s.cogs,
    itemProfit: s.itemProfit,
    discounts: s.discounts,
    grossProfit: s.grossProfit,
    margin: s.margin,
  });
}

export async function products(req: Request, res: Response) {
  const { range } = await rangeAndZone(req);
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }).parse(req.query);
  res.json(await reports.bestSellers(range, limit));
}

export async function exportReport(req: Request, res: Response) {
  const { range, tz } = await rangeAndZone(req);
  const { type, format } = z
    .object({ type: z.enum(['sales', 'products', 'transactions']), format: z.enum(['csv', 'xlsx']).default('csv') })
    .parse(req.query);
  const file = await exporter.exportReport(type, format, range, tz);
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
}
