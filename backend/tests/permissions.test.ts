import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createProduct, prisma, setupUsers } from './helpers';

describe('role permissions', () => {
  let admin: Client;
  let cashier: Client;
  let productId: number;

  beforeAll(async () => {
    ({ admin, cashier } = await setupUsers());
    productId = (await createProduct({ stock: 50 })).id;
  });
  afterAll(() => prisma.$disconnect());

  it.each([
    ['post', '/api/products', { sku: 'X', name: 'X', purchasePrice: 1, sellingPrice: 2, unit: 'pcs' }],
    ['put', '/api/products/1', { sku: 'X', name: 'X', purchasePrice: 1, sellingPrice: 2, unit: 'pcs' }],
    ['delete', '/api/products/1', undefined],
    ['post', '/api/categories', { name: 'X' }],
    ['post', '/api/inventory/adjustments', { productId: 1, kind: 'ADD', quantity: 1, reason: 'x' }],
    ['get', '/api/inventory', undefined],
    ['get', '/api/reports/sales', undefined],
    ['get', '/api/reports/dashboard', undefined],
    ['get', '/api/users', undefined],
    ['post', '/api/users', { name: 'x', username: 'xx', password: 'password1', role: 'ADMIN' }],
    ['put', '/api/settings', {}],
    ['get', '/api/activity-logs', undefined],
    ['post', '/api/transactions/1/void', { reason: 'test' }],
  ] as const)('cashier cannot %s %s', async (method, url, body) => {
    const res =
      method === 'get' || method === 'delete' ? await cashier[method](url) : await cashier[method](url, body ?? {});
    expect(res.status).toBe(403);
  });

  it('cashier can browse products but never sees purchase prices', async () => {
    const list = await cashier.get('/api/products');
    expect(list.status).toBe(200);
    expect(list.body.data[0].purchasePrice).toBeUndefined();
    const one = await cashier.get(`/api/products/${productId}`);
    expect(one.body.purchasePrice).toBeUndefined();

    const adminView = await admin.get(`/api/products/${productId}`);
    expect(adminView.body.purchasePrice).toBe(7000);
  });

  it('cashier only sees active products', async () => {
    await createProduct({ name: 'Hidden', isActive: false });
    const list = await cashier.get('/api/products?isActive=false');
    expect(list.body.data.every((p: { isActive: boolean }) => p.isActive)).toBe(true);
  });

  it('cashier can read store settings (needed for receipts)', async () => {
    expect((await cashier.get('/api/settings')).status).toBe(200);
  });

  it('cashier can check out and see only their own transactions', async () => {
    const sale = await cashier.post('/api/transactions', {
      items: [{ productId, quantity: 1 }],
      payment: { method: 'CASH', amount: 10000 },
    });
    expect(sale.status).toBe(201);
    expect(sale.body.totalCost).toBeUndefined();
    expect(sale.body.items[0].purchasePrice).toBeUndefined();

    const adminSale = await admin.post('/api/transactions', {
      items: [{ productId, quantity: 1 }],
      payment: { method: 'CASH', amount: 10000 },
    });
    expect(adminSale.status).toBe(201);

    const mine = await cashier.get('/api/transactions');
    expect(mine.body.total).toBe(1);
    expect(mine.body.data[0].id).toBe(sale.body.id);

    // Even when trying to filter for someone else's sales
    const sneaky = await cashier.get(`/api/transactions?cashierId=${adminSale.body.cashier.id}`);
    expect(sneaky.body.data.map((t: { id: number }) => t.id)).toEqual([sale.body.id]);

    const forbidden = await cashier.get(`/api/transactions/${adminSale.body.id}`);
    expect(forbidden.status).toBe(403);

    const all = await admin.get('/api/transactions');
    expect(all.body.total).toBe(2);
  });
});
