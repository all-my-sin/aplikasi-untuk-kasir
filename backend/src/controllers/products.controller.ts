import type { Request, Response } from 'express';
import { z } from 'zod';
import { STOCK_STATUSES, UTF8_BOM, productImportSchema, productSchema, productUpdateSchema } from '@pos/shared';
import { currentUser } from '../middleware/auth';
import * as products from '../services/products.service';
import { idParam, optionalBool, paginationQuery } from '../validators/common';

const filterQuery = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  stockStatus: z.enum(STOCK_STATUSES).optional(),
  isActive: optionalBool,
});

const listQuery = paginationQuery.extend(filterQuery.shape).extend({
  sort: z.enum(['name', 'sellingPrice', 'stock', 'createdAt', 'sku']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export async function list(req: Request, res: Response) {
  const user = currentUser(req);
  const q = listQuery.parse(req.query);
  // Cashiers only ever see sellable (active) products
  if (user.role !== 'ADMIN') q.isActive = true;
  res.json(await products.listProducts(q, user.role));
}

export async function lookup(req: Request, res: Response) {
  const { code } = z.object({ code: z.string().max(100) }).parse(req.query);
  res.json(await products.lookupProduct(code, currentUser(req).role));
}

export async function get(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  res.json(await products.getProduct(id, currentUser(req).role));
}

export async function create(req: Request, res: Response) {
  const data = productSchema.parse(req.body);
  res.status(201).json(await products.createProduct(data, currentUser(req)));
}

export async function update(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const data = productUpdateSchema.parse(req.body);
  res.json(await products.updateProduct(id, data, currentUser(req)));
}

export async function archive(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  res.json(await products.archiveProduct(id, currentUser(req)));
}

export async function exportCsv(req: Request, res: Response) {
  const q = filterQuery.parse(req.query);
  const csv = await products.exportProductsCsv(q);
  const filename = `products-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(UTF8_BOM + csv);
}

export async function importCsv(req: Request, res: Response) {
  const { rows } = productImportSchema.parse(req.body);
  const result = await products.importProducts(rows, currentUser(req));
  res.status(result.errors.length ? 422 : 200).json(result);
}
