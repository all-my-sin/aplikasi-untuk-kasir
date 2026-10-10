import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env';

export const prisma = new PrismaClient({
  log: env.isProduction ? ['error'] : ['warn', 'error'],
});

/** Either the root client or an interactive transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

export { Prisma };
