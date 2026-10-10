import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type Client, createProduct, prisma, setupUsers } from './helpers';

describe('reports', () => {
  let admin: Client;
  let cashier: Client;
  const range = () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    return `from=${from}&to=${to}&tz=Asia/Jakarta`;
  };

  beforeEach(async () => {
    ({ admin, cashier } = await setupUsers());
  });
  afterAll(() => prisma.$disconnect());

  it('computes revenue, COGS and profit from price snapshots', async () => {
    const water = await createProduct({ name: 'Water', purchasePrice: 2400, sellingPrice: 3000, stock: 500 });
    const chips = await createProduct({ name: 'Chips', purchasePrice: 7500, sellingPrice: 10500, stock: 100 });

    await cashier.post('/api/transactions', {
      items: [
        { productId: water.id, quantity: 10 },
        { productId: chips.id, quantity: 2 },
      ],
      payment: { method: 'CASH', amount: 51000 },
    });
    await cashier.post('/api/transactions', {
      items: [{ productId: water.id, quantity: 5 }],
      discountType: 'AMOUNT',
      discountValue: 1000,
      payment: { method: 'QRIS', amount: 14000 },
    });

    // Changing current prices must not change historical profit
    await prisma.product.update({ where: { id: water.id }, data: { purchasePrice: 2900, sellingPrice: 5000 } });

    const res = await admin.get(`/api/reports/sales?${range()}`);
    expect(res.status).toBe(200);
    const s = res.body.summary;
    // gross = 15×3000 + 2×10500 = 66,000 ; cogs = 15×2400 + 2×7500 = 51,000
    expect(s).toMatchObject({
      transactions: 2,
      itemsSold: 17,
      grossSales: 66000,
      discounts: 1000,
      netSales: 65000,
      cogs: 51000,
      itemProfit: 15000,
      grossProfit: 14000,
      averageTransaction: 32500,
    });
    expect(s.margin).toBeCloseTo(21.54, 2);

    expect(res.body.payments).toEqual(
      expect.arrayContaining([
        { method: 'CASH', transactions: 1, amount: 51000 },
        { method: 'QRIS', transactions: 1, amount: 14000 },
      ]),
    );
    const daily = res.body.daily as { revenue: number; transactions: number; profit: number }[];
    expect(daily.reduce((a, d) => a + d.revenue, 0)).toBe(65000);
    expect(daily.reduce((a, d) => a + d.profit, 0)).toBe(14000);

    const profit = await admin.get(`/api/reports/profit?${range()}`);
    expect(profit.body).toMatchObject({ revenue: 65000, cogs: 51000, grossProfit: 14000 });
  });

  it('ranks best-selling products by quantity with revenue and profit', async () => {
    const a = await createProduct({ name: 'A', purchasePrice: 1000, sellingPrice: 1500, stock: 100 });
    const b = await createProduct({ name: 'B', purchasePrice: 5000, sellingPrice: 8000, stock: 100 });
    await cashier.post('/api/transactions', {
      items: [
        { productId: a.id, quantity: 7 },
        { productId: b.id, quantity: 3 },
      ],
      payment: { method: 'CASH', amount: 100000 },
    });
    const res = await admin.get(`/api/reports/products?${range()}`);
    expect(res.body).toEqual([
      { rank: 1, productId: a.id, name: 'A', sku: expect.any(String), quantity: 7, revenue: 10500, profit: 3500 },
      { rank: 2, productId: b.id, name: 'B', sku: expect.any(String), quantity: 3, revenue: 24000, profit: 9000 },
    ]);
  });

  it('excludes voided transactions', async () => {
    const p = await createProduct({ stock: 10 });
    const sale = await cashier.post('/api/transactions', {
      items: [{ productId: p.id, quantity: 1 }],
      payment: { method: 'CASH', amount: 10000 },
    });
    await admin.post(`/api/transactions/${sale.body.id}/void`, { reason: 'mistake' });
    const res = await admin.get(`/api/reports/sales?${range()}`);
    expect(res.body.summary.transactions).toBe(0);
    expect(res.body.summary.netSales).toBe(0);
  });

  it('builds the dashboard with stock alerts', async () => {
    await createProduct({ name: 'Out', stock: 0, minStock: 3 });
    await createProduct({ name: 'Low', stock: 2, minStock: 3 });
    await createProduct({ name: 'Fine', stock: 30, minStock: 3 });
    await createProduct({ name: 'Archived', stock: 0, minStock: 3, isActive: false });
    const res = await admin.get(`/api/reports/dashboard?${range()}`);
    expect(res.body).toMatchObject({ totalProducts: 3, lowStockCount: 1, outOfStockCount: 1 });
    expect(res.body.lowStockProducts.map((p: { name: string }) => p.name)).toEqual(['Out', 'Low']);
  });

  it('exports CSV and Excel files', async () => {
    const p = await createProduct({ stock: 10 });
    await cashier.post('/api/transactions', { items: [{ productId: p.id, quantity: 1 }], payment: { method: 'CASH', amount: 10000 } });

    const csv = await admin.get(`/api/reports/export?type=transactions&format=csv&${range()}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-disposition']).toContain('.csv');
    expect(csv.text).toContain('Number,Date,Cashier');

    const xlsx = await admin
      .get(`/api/reports/export?type=sales&format=xlsx&${range()}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // xlsx is a zip file
  });

  it('validates date ranges', async () => {
    const res = await admin.get('/api/reports/sales?from=2026-02-01&to=2026-01-01');
    expect(res.status).toBe(400);
    const tz = await admin.get('/api/reports/sales?tz=Mars/Olympus');
    expect(tz.status).toBe(400);
  });
});

describe('users & settings', () => {
  let admin: Client;
  let adminId: number;
  let cashierId: number;

  beforeEach(async () => {
    const s = await setupUsers();
    admin = s.admin;
    adminId = s.adminUser.id;
    cashierId = s.cashierUser.id;
  });

  it('creates users with hashed passwords', async () => {
    const res = await admin.post('/api/users', {
      name: 'Siti',
      username: 'Siti.K',
      email: 'siti@example.com',
      password: 'secret-pass',
      role: 'CASHIER',
    });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('siti.k');
    expect(res.body.passwordHash).toBeUndefined();
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.passwordHash).not.toContain('secret-pass');
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
  });

  it('rejects duplicate usernames and weak passwords', async () => {
    const dup = await admin.post('/api/users', { name: 'X', username: 'cashier', password: 'password123', role: 'CASHIER' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('This username is already in use.');
    const weak = await admin.post('/api/users', { name: 'X', username: 'newbie', password: 'short', role: 'CASHIER' });
    expect(weak.status).toBe(400);
  });

  it('deactivates users and revokes their session', async () => {
    const res = await admin.patch(`/api/users/${cashierId}/status`, { isActive: false });
    expect(res.body.isActive).toBe(false);
    const login = await admin.agent.post('/api/auth/login').send({ username: 'cashier', password: 'password123' });
    expect(login.status).toBe(403);
  });

  it('prevents admins from locking themselves out', async () => {
    expect((await admin.patch(`/api/users/${adminId}/status`, { isActive: false })).status).toBe(400);
    const demote = await admin.put(`/api/users/${adminId}`, { name: 'Admin', username: 'admin', role: 'CASHIER', isActive: true });
    expect(demote.status).toBe(400);
  });

  it('changes roles', async () => {
    const res = await admin.put(`/api/users/${cashierId}`, { name: 'Cashier', username: 'cashier', role: 'ADMIN', isActive: true });
    expect(res.body.role).toBe('ADMIN');
    const log = await prisma.activityLog.findFirst({ where: { action: 'USER_UPDATED' } });
    expect(log?.description).toContain('role CASHIER → ADMIN');
  });

  it('updates store settings and logs the change', async () => {
    const current = (await admin.get('/api/settings')).body;
    expect(current.currency).toBe('IDR');
    const res = await admin.put('/api/settings', {
      ...current,
      storeName: 'Toko Baru',
      receiptPaperSize: '80',
      taxEnabled: true,
      taxRate: 11,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ storeName: 'Toko Baru', receiptPaperSize: '80', taxEnabled: true });
    const log = await prisma.activityLog.findFirst({ where: { action: 'SETTINGS_UPDATED' } });
    expect(log?.description).toContain('store name');

    const bad = await admin.put('/api/settings', { ...current, receiptPaperSize: '72' });
    expect(bad.status).toBe(400);
  });

  it('lists the activity log for admins', async () => {
    const res = await admin.get('/api/activity-logs?entity=User');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ action: 'LOGIN', user: { username: expect.any(String) } });
  });
});
