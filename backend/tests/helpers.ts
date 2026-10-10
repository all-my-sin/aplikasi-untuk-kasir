import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Role } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const app = createApp();
export { prisma };

const TABLES = [
  'ActivityLog',
  'InventoryMovement',
  'Payment',
  'TransactionItem',
  'Transaction',
  'Product',
  'Category',
  'User',
  'StoreSetting',
  'DailySequence',
];

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

export async function createUser(username: string, role: Role, password = 'password123', isActive = true) {
  return prisma.user.create({
    data: {
      name: username[0].toUpperCase() + username.slice(1),
      username,
      role,
      isActive,
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
}

/** A supertest agent that keeps cookies and sends the CSRF header. */
export function client() {
  const agent = request.agent(app);
  const withHeaders = <T extends request.Test>(t: T) => t.set('X-Requested-With', 'XMLHttpRequest');
  return {
    agent,
    get: (url: string) => withHeaders(agent.get(url)),
    post: (url: string, body?: object) => withHeaders(agent.post(url)).send(body ?? {}),
    put: (url: string, body?: object) => withHeaders(agent.put(url)).send(body ?? {}),
    patch: (url: string, body?: object) => withHeaders(agent.patch(url)).send(body ?? {}),
    delete: (url: string) => withHeaders(agent.delete(url)),
  };
}

export type Client = ReturnType<typeof client>;

export async function loginAs(username: string, password = 'password123'): Promise<Client> {
  const c = client();
  const res = await c.post('/api/auth/login', { username, password });
  if (res.status !== 200) throw new Error(`Login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  return c;
}

/** Fresh DB with an admin and a cashier, both logged in. */
export async function setupUsers() {
  await resetDb();
  const adminUser = await createUser('admin', 'ADMIN');
  const cashierUser = await createUser('cashier', 'CASHIER');
  return {
    adminUser,
    cashierUser,
    admin: await loginAs('admin'),
    cashier: await loginAs('cashier'),
  };
}

let skuCounter = 0;
export async function createProduct(
  overrides: Partial<{
    sku: string;
    barcode: string | null;
    name: string;
    purchasePrice: number;
    sellingPrice: number;
    stock: number;
    minStock: number;
    isActive: boolean;
    categoryId: number | null;
  }> = {},
) {
  skuCounter++;
  return prisma.product.create({
    data: {
      sku: `SKU-${skuCounter}`,
      name: `Product ${skuCounter}`,
      purchasePrice: 7000,
      sellingPrice: 10000,
      stock: 10,
      minStock: 2,
      unit: 'pcs',
      ...overrides,
    },
  });
}
