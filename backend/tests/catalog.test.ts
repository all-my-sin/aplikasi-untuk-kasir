import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type Client, createProduct, prisma, setupUsers } from './helpers';

const validProduct = {
  sku: 'BEV-001',
  barcode: '8991002101234',
  name: 'Bottled Water 600ml',
  purchasePrice: 2400,
  sellingPrice: 3000,
  stock: 50,
  minStock: 10,
  unit: 'bottle',
};

describe('categories', () => {
  let admin: Client;
  beforeEach(async () => {
    ({ admin } = await setupUsers());
  });
  afterAll(() => prisma.$disconnect());

  it('supports create, list, update and delete', async () => {
    const created = await admin.post('/api/categories', { name: 'Beverages', description: 'Drinks' });
    expect(created.status).toBe(201);

    const list = await admin.get('/api/categories');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ name: 'Beverages', productCount: 0 });

    const updated = await admin.put(`/api/categories/${created.body.id}`, { name: 'Drinks', isActive: false });
    expect(updated.body).toMatchObject({ name: 'Drinks', isActive: false });

    const removed = await admin.delete(`/api/categories/${created.body.id}`);
    expect(removed.status).toBe(204);
    expect(await prisma.category.count()).toBe(0);
  });

  it('rejects duplicate names', async () => {
    await admin.post('/api/categories', { name: 'Snacks' });
    const dup = await admin.post('/api/categories', { name: 'Snacks' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('This name is already in use.');
  });

  it('refuses to delete a category that still has products', async () => {
    const cat = await admin.post('/api/categories', { name: 'Snacks' });
    await createProduct({ categoryId: cat.body.id });
    const res = await admin.delete(`/api/categories/${cat.body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_IN_USE');
  });

  it('requires a name', async () => {
    const res = await admin.post('/api/categories', { name: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.name).toBe('Category name is required');
  });
});

describe('products', () => {
  let admin: Client;
  let cashier: Client;
  beforeEach(async () => {
    ({ admin, cashier } = await setupUsers());
  });

  it('creates a product and records its opening stock', async () => {
    const res = await admin.post('/api/products', validProduct);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ sku: 'BEV-001', stock: 50, stockStatus: 'IN_STOCK' });

    const movement = await prisma.inventoryMovement.findFirst({ where: { productId: res.body.id } });
    expect(movement).toMatchObject({ type: 'INITIAL', previousStock: 0, newStock: 50, quantityChange: 50 });

    const log = await prisma.activityLog.findFirst({ where: { action: 'PRODUCT_CREATED' } });
    expect(log?.description).toContain('created product "Bottled Water 600ml"');
  });

  it('enforces unique SKU and barcode', async () => {
    await admin.post('/api/products', validProduct);
    const dupSku = await admin.post('/api/products', { ...validProduct, barcode: '111' });
    expect(dupSku.status).toBe(409);
    expect(dupSku.body.error.message).toBe('This SKU is already in use.');

    const dupBarcode = await admin.post('/api/products', { ...validProduct, sku: 'OTHER' });
    expect(dupBarcode.status).toBe(409);
    expect(dupBarcode.body.error.message).toBe('This barcode is already in use.');
  });

  it('validates required fields and non-negative values', async () => {
    const res = await admin.post('/api/products', { ...validProduct, name: '', sellingPrice: -1, stock: -5 });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(['name', 'sellingPrice', 'stock']));
  });

  it('updates a product without touching stock and logs price changes', async () => {
    const { body: p } = await admin.post('/api/products', validProduct);
    const res = await admin.put(`/api/products/${p.id}`, { ...validProduct, sellingPrice: 3500, stock: 999 });
    expect(res.status).toBe(200);
    expect(res.body.sellingPrice).toBe(3500);
    expect(res.body.stock).toBe(50);

    const log = await prisma.activityLog.findFirst({ where: { action: 'PRODUCT_PRICE_CHANGED' } });
    expect(log?.description).toContain('Rp3.000 → Rp3.500');
  });

  it('archives instead of deleting', async () => {
    const { body: p } = await admin.post('/api/products', validProduct);
    const res = await admin.delete(`/api/products/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    expect(await prisma.product.count()).toBe(1);
  });

  it('looks up products by barcode or SKU', async () => {
    await admin.post('/api/products', validProduct);
    const byBarcode = await cashier.get('/api/products/lookup?code=8991002101234');
    expect(byBarcode.status).toBe(200);
    expect(byBarcode.body.sku).toBe('BEV-001');

    const bySku = await cashier.get('/api/products/lookup?code=bev-001');
    expect(bySku.status).toBe(200);

    const missing = await cashier.get('/api/products/lookup?code=000');
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe('No product found for code "000".');
  });

  it('filters by stock status, searches and sorts server-side', async () => {
    await createProduct({ name: 'Out', stock: 0, minStock: 5 });
    await createProduct({ name: 'Low', stock: 5, minStock: 5 });
    await createProduct({ name: 'Plenty', stock: 50, minStock: 5, sellingPrice: 1 });

    const out = await admin.get('/api/products?stockStatus=OUT_OF_STOCK');
    expect(out.body.data.map((p: { name: string }) => p.name)).toEqual(['Out']);
    const low = await admin.get('/api/products?stockStatus=LOW_STOCK');
    expect(low.body.data.map((p: { name: string }) => p.name)).toEqual(['Low']);
    const ok = await admin.get('/api/products?stockStatus=IN_STOCK');
    expect(ok.body.data.map((p: { name: string }) => p.name)).toEqual(['Plenty']);

    const search = await admin.get('/api/products?search=plen');
    expect(search.body.total).toBe(1);

    const byPrice = await admin.get('/api/products?sort=sellingPrice&order=asc');
    expect(byPrice.body.data[0].name).toBe('Plenty');

    const page = await admin.get('/api/products?pageSize=2&page=2');
    expect(page.body).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(page.body.data).toHaveLength(1);
  });

  it('imports products from CSV rows (create + update by SKU)', async () => {
    await createProduct({ sku: 'EXIST-1', name: 'Old name', stock: 5 });
    const res = await admin.post('/api/products/import', {
      rows: [
        { sku: 'NEW-1', name: 'New thing', category: 'Snacks', purchasePrice: '1.000', sellingPrice: '1.500', stock: '12' },
        { sku: 'EXIST-1', name: 'New name', purchasePrice: '2000', sellingPrice: '3000', stock: '8' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, updated: 1, errors: [] });

    const created = await prisma.product.findUnique({ where: { sku: 'NEW-1' }, include: { category: true } });
    expect(created).toMatchObject({ purchasePrice: 1000, sellingPrice: 1500, stock: 12 });
    expect(created?.category?.name).toBe('Snacks');
    const updated = await prisma.product.findUnique({ where: { sku: 'EXIST-1' } });
    expect(updated).toMatchObject({ name: 'New name', stock: 8 });
    const movement = await prisma.inventoryMovement.findFirst({ where: { productId: updated!.id, type: 'IMPORT' } });
    expect(movement).toMatchObject({ previousStock: 5, newStock: 8, quantityChange: 3 });
  });

  it('rejects an import with invalid rows without writing anything', async () => {
    const res = await admin.post('/api/products/import', {
      rows: [
        { sku: 'OK-1', name: 'Fine', purchasePrice: '1', sellingPrice: '2' },
        { sku: 'BAD-1', name: '', purchasePrice: 'abc', sellingPrice: '2' },
      ],
    });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].row).toBe(3);
    expect(await prisma.product.count()).toBe(0);
  });

  it('exports products as CSV', async () => {
    await admin.post('/api/products', validProduct);
    const res = await admin.get('/api/products/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('sku,barcode,name');
    expect(res.text).toContain('BEV-001,8991002101234,Bottled Water 600ml');
  });
});
