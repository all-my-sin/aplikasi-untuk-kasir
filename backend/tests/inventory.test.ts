import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type Client, createProduct, prisma, setupUsers } from './helpers';

describe('inventory adjustments', () => {
  let admin: Client;
  let productId: number;

  beforeEach(async () => {
    ({ admin } = await setupUsers());
    productId = (await createProduct({ name: 'Bottled Water 600ml', stock: 50 })).id;
  });
  afterAll(() => prisma.$disconnect());

  const stockOf = async (id: number) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;

  it('adds stock and records the movement', async () => {
    const res = await admin.post('/api/inventory/adjustments', { productId, kind: 'ADD', quantity: 20, reason: 'Restock' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'RESTOCK', previousStock: 50, quantityChange: 20, newStock: 70, reason: 'Restock' });
    expect(await stockOf(productId)).toBe(70);

    const log = await prisma.activityLog.findFirst({ where: { action: 'STOCK_ADD' } });
    expect(log?.description).toContain('added 20 units of "Bottled Water 600ml"');
  });

  it('removes stock', async () => {
    const res = await admin.post('/api/inventory/adjustments', { productId, kind: 'REMOVE', quantity: 5, reason: 'Damaged' });
    expect(res.body).toMatchObject({ type: 'REMOVE', quantityChange: -5, newStock: 45 });
    expect(await stockOf(productId)).toBe(45);
  });

  it('sets stock to an absolute value', async () => {
    const res = await admin.post('/api/inventory/adjustments', { productId, kind: 'SET', quantity: 42, reason: 'Recount' });
    expect(res.body).toMatchObject({ type: 'ADJUSTMENT', previousStock: 50, quantityChange: -8, newStock: 42 });
  });

  it('never allows stock to go negative', async () => {
    const res = await admin.post('/api/inventory/adjustments', { productId, kind: 'REMOVE', quantity: 51, reason: 'Loss' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(productId)).toBe(50);
    expect(await prisma.inventoryMovement.count()).toBe(0);
  });

  it('is protected by a database CHECK constraint as a last resort', async () => {
    await expect(prisma.product.update({ where: { id: productId }, data: { stock: -1 } })).rejects.toThrow();
  });

  it('rejects zero or negative quantities and missing reasons', async () => {
    for (const body of [
      { productId, kind: 'ADD', quantity: 0, reason: 'x' },
      { productId, kind: 'ADD', quantity: -3, reason: 'x' },
      { productId, kind: 'ADD', quantity: 3, reason: '' },
      { productId, kind: 'ADD', quantity: 1.5, reason: 'x' },
    ]) {
      const res = await admin.post('/api/inventory/adjustments', body);
      expect(res.status).toBe(400);
    }
  });

  it('handles concurrent adjustments without losing updates', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () =>
        admin.post('/api/inventory/adjustments', { productId, kind: 'ADD', quantity: 1, reason: 'Concurrent' }),
      ),
    );
    expect(await stockOf(productId)).toBe(60);
    const movements = await prisma.inventoryMovement.findMany({ where: { productId }, orderBy: { id: 'asc' } });
    // Every movement chains from the previous one
    movements.forEach((m, i) => {
      expect(m.previousStock).toBe(50 + i);
      expect(m.newStock).toBe(51 + i);
    });
  });

  it('performs a stock opname, only recording differences', async () => {
    const other = await createProduct({ stock: 7 });
    const res = await admin.post('/api/inventory/opname', {
      items: [
        { productId, countedStock: 48 },
        { productId: other.id, countedStock: 7 },
      ],
      note: 'Monthly count',
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ counted: 2, corrected: 1 });
    expect(await stockOf(productId)).toBe(48);
    const movement = await prisma.inventoryMovement.findFirstOrThrow({ where: { type: 'OPNAME' } });
    expect(movement).toMatchObject({ productId, previousStock: 50, newStock: 48, reason: 'Stock opname: Monthly count' });
  });

  it('lists movement history with filters', async () => {
    await admin.post('/api/inventory/adjustments', { productId, kind: 'ADD', quantity: 1, reason: 'a' });
    await admin.post('/api/inventory/adjustments', { productId, kind: 'REMOVE', quantity: 1, reason: 'b' });
    const all = await admin.get(`/api/inventory/movements?productId=${productId}`);
    expect(all.body.total).toBe(2);
    expect(all.body.data[0]).toMatchObject({ type: 'REMOVE', user: { name: 'Admin' }, product: { id: productId } });
    const restocks = await admin.get('/api/inventory/movements?type=RESTOCK');
    expect(restocks.body.total).toBe(1);
  });
});
