import type { Request, Response } from 'express';
import { z } from 'zod';
import { MOVEMENT_TYPES, STOCK_STATUSES, inventoryAdjustmentSchema, stockOpnameSchema } from '@pos/shared';
import { currentUser } from '../middleware/auth';
import * as inventory from '../services/inventory.service';
import { listProducts } from '../services/products.service';
import { dateRangeQuery, optionalBool, paginationQuery } from '../validators/common';

const stockQuery = paginationQuery.extend({
  search: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  stockStatus: z.enum(STOCK_STATUSES).optional(),
  isActive: optionalBool.default(true),
  sort: z.enum(['name', 'stock', 'sku']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

/** Stock overview (product list focused on stock levels). */
export async function list(req: Request, res: Response) {
  const q = stockQuery.parse(req.query);
  res.json(await listProducts({ ...q, isActive: q.isActive }, currentUser(req).role));
}

export async function adjust(req: Request, res: Response) {
  const data = inventoryAdjustmentSchema.parse(req.body);
  res.status(201).json(await inventory.adjustStock(data, currentUser(req)));
}

export async function opname(req: Request, res: Response) {
  const data = stockOpnameSchema.parse(req.body);
  res.status(201).json(await inventory.stockOpname(data, currentUser(req)));
}

export async function movements(req: Request, res: Response) {
  const q = paginationQuery
    .extend({
      productId: z.coerce.number().int().positive().optional(),
      type: z.enum(MOVEMENT_TYPES).optional(),
    })
    .and(dateRangeQuery)
    .parse(req.query);
  res.json(await inventory.listMovements(q));
}
