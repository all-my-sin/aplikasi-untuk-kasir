// Query-string validators (values arrive as strings, so they are coerced).
import { z } from 'zod';
import { isValidTimeZone } from '@pos/shared';
import { badRequest } from '../lib/errors';

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationQuery>;

export function paginate(p: Pagination) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export function paginated<T>(data: T[], total: number, p: Pagination) {
  return { data, page: p.page, pageSize: p.pageSize, total, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) };
}

const optionalBool = z
  .enum(['true', 'false', 'all'])
  .optional()
  .transform((v) => (v === undefined || v === 'all' ? undefined : v === 'true'));

export { optionalBool };

const MAX_RANGE_MS = 5 * 366 * 24 * 60 * 60 * 1000;

/** ?from=ISO&to=ISO (to is exclusive) + optional ?tz=Area/City */
export const dateRangeQuery = z
  .object({
    from: z.coerce.date({ error: 'Invalid start date' }).optional(),
    to: z.coerce.date({ error: 'Invalid end date' }).optional(),
    tz: z
      .string()
      .optional()
      .refine((tz) => !tz || isValidTimeZone(tz), 'Unknown time zone'),
  })
  .refine((v) => !v.from || !v.to || v.from < v.to, { message: 'Start date must be before end date', path: ['from'] });

export type DateRange = { from: Date; to: Date };

/** Resolves a date range, defaulting to the last 30 days, and guards against absurd ranges. */
export function requireRange(q: { from?: Date; to?: Date }, defaultDays = 30): DateRange {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) throw badRequest('The date range is too large (maximum 5 years).');
  return { from, to };
}
