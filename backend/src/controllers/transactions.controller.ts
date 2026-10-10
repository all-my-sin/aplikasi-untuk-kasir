import type { Request, Response } from 'express';
import { z } from 'zod';
import { PAYMENT_METHODS, TRANSACTION_STATUSES, checkoutSchema, voidTransactionSchema } from '@pos/shared';
import { currentUser } from '../middleware/auth';
import * as transactions from '../services/transactions.service';
import { dateRangeQuery, idParam, paginationQuery } from '../validators/common';

const listQuery = paginationQuery
  .extend({
    search: z.string().trim().max(50).optional(),
    cashierId: z.coerce.number().int().positive().optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    status: z.enum(TRANSACTION_STATUSES).optional(),
  })
  .and(dateRangeQuery);

export async function list(req: Request, res: Response) {
  res.json(await transactions.listTransactions(listQuery.parse(req.query), currentUser(req)));
}

export async function get(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  res.json(await transactions.getTransaction(id, currentUser(req)));
}

export async function create(req: Request, res: Response) {
  const data = checkoutSchema.parse(req.body);
  res.status(201).json(await transactions.checkout(data, currentUser(req)));
}

export async function voidTransaction(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const { reason } = voidTransactionSchema.parse(req.body);
  res.json(await transactions.voidTransaction(id, reason, currentUser(req)));
}
