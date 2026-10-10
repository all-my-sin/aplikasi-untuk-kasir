import type { Request, Response } from 'express';
import { z } from 'zod';
import { categorySchema } from '@pos/shared';
import { currentUser } from '../middleware/auth';
import * as categories from '../services/categories.service';
import { idParam, optionalBool } from '../validators/common';

export async function list(req: Request, res: Response) {
  const q = z.object({ search: z.string().trim().max(100).optional(), isActive: optionalBool }).parse(req.query);
  if (currentUser(req).role !== 'ADMIN') q.isActive = true;
  res.json(await categories.listCategories(q));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await categories.createCategory(categorySchema.parse(req.body), currentUser(req)));
}

export async function update(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  res.json(await categories.updateCategory(id, categorySchema.parse(req.body), currentUser(req)));
}

export async function remove(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  await categories.deleteCategory(id, currentUser(req));
  res.status(204).end();
}
