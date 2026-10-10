import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { type Client, createProduct, prisma, setupUsers } from './helpers';

const today = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  return p.replace(/-/g, '');
};

describe('checkout', () => {
  let cashier: Client;
  let admin: Client;
  let water: { id: number };
  let noodles: { id: number };

  beforeEach(async () => {
    ({ cashier, admin } = await setupUsers());
    water = await createProduct({ name: 'Bottled Water', purchasePrice: 2400, sellingPrice: 3000, stock: 50 });
    noodles = await createProduct({ name: 'Instant Noodles', purchasePrice: 2600, sellingPrice: 3500, stock: 10 });
  });
  afterAll(() => prisma.$disconnect());

  const stockOf = async (id: number) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
  const sale = (body: object) => cashier.post('/api/transactions', body);

  it('completes a cash sale: totals, change, items, payment, stock and movements', async () => {
    const res = await sale({
      items: [
        { productId: water.id, quantity: 2 },
        { productId: noodles.id, quantity: 3 },
      ],
      payment: { method: 'CASH', amount: 20000 },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      number: `INV-${today()}-0001`,
      status: 'COMPLETED',
      subtotal: 16500,
      discountAmount: 0,
      taxAmount: 0,
      total: 16500,
      amountPaid: 20000,
      change: 3500,
      itemCount: 5,
      cashier: { name: 'Cashier' },
    });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({ productName: 'Bottled Water', unitPrice: 3000, quantity: 2, subtotal: 6000 });
    expect(res.body.payments).toEqual([expect.objectContaining({ method: 'CASH', amount: 20000 })]);

    expect(await stockOf(water.id)).toBe(48);
    expect(await stockOf(noodles.id)).toBe(7);

    const movements = await prisma.inventoryMovement.findMany({ where: { transactionId: res.body.id }, orderBy: { productId: 'asc' } });
    expect(movements).toEqual([
      expect.objectContaining({ type: 'SALE', productId: water.id, quantityChange: -2, previousStock: 50, newStock: 48 }),
      expect.objectContaining({ type: 'SALE', productId: noodles.id, quantityChange: -3, previousStock: 10, newStock: 7 }),
    ]);

    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(tx.totalCost).toBe(2 * 2400 + 3 * 2600);
    const log = await prisma.activityLog.findFirst({ where: { action: 'TRANSACTION_COMPLETED' } });
    expect(log?.description).toBe(`Cashier completed transaction INV-${today()}-0001 (Rp16.500)`);
  });

  it('accepts exact cash payment with zero change', async () => {
    const res = await sale({ items: [{ productId: water.id, quantity: 1 }], payment: { method: 'CASH', amount: 3000 } });
    expect(res.status).toBe(201);
    expect(res.body.change).toBe(0);
  });

  it('applies a fixed discount', async () => {
    const res = await sale({
      items: [{ productId: water.id, quantity: 10 }],
      discountType: 'AMOUNT',
      discountValue: 5000,
      payment: { method: 'CASH', amount: 30000 },
    });
    expect(res.body).toMatchObject({ subtotal: 30000, discountAmount: 5000, total: 25000, change: 5000 });
  });

  it('applies a percentage discount', async () => {
    const res = await sale({
      items: [{ productId: noodles.id, quantity: 3 }],
      discountType: 'PERCENT',
      discountValue: 10,
      payment: { method: 'CASH', amount: 10000 },
    });
    expect(res.body).toMatchObject({ subtotal: 10500, discountAmount: 1050, total: 9450, change: 550 });
  });

  it('caps the discount at the subtotal', async () => {
    const res = await sale({
      items: [{ productId: water.id, quantity: 1 }],
      discountType: 'AMOUNT',
      discountValue: 999999,
      payment: { method: 'CASH', amount: 0 },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ discountAmount: 3000, total: 0 });
  });

  it('adds tax after discount when tax is enabled', async () => {
    await prisma.storeSetting.upsert({ where: { id: 1 }, update: { taxEnabled: true, taxRate: 11 }, create: { id: 1, taxEnabled: true, taxRate: 11 } });
    const res = await sale({
      items: [{ productId: water.id, quantity: 10 }],
      discountType: 'AMOUNT',
      discountValue: 5000,
      payment: { method: 'CASH', amount: 50000 },
    });
    expect(res.body).toMatchObject({ subtotal: 30000, discountAmount: 5000, taxRate: 11, taxAmount: 2750, total: 27750, change: 22250 });
  });

  it('rejects insufficient cash payment and changes nothing', async () => {
    const res = await sale({ items: [{ productId: water.id, quantity: 2 }], payment: { method: 'CASH', amount: 5999 } });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Insufficient payment amount.');
    expect(await stockOf(water.id)).toBe(50);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it('requires non-cash payments to match the total exactly', async () => {
    const bad = await sale({ items: [{ productId: water.id, quantity: 1 }], payment: { method: 'QRIS', amount: 5000 } });
    expect(bad.status).toBe(400);
    const ok = await sale({
      items: [{ productId: water.id, quantity: 1 }],
      payment: { method: 'DEBIT_CARD', amount: 3000, reference: 'APPR-123' },
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ amountPaid: 3000, change: 0 });
    expect(ok.body.payments[0]).toMatchObject({ method: 'DEBIT_CARD', reference: 'APPR-123' });
  });

  it('rejects quantities above available stock', async () => {
    const res = await sale({ items: [{ productId: noodles.id, quantity: 11 }], payment: { method: 'CASH', amount: 100000 } });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_STOCK', available: 10, productId: noodles.id });
    expect(res.body.error.message).toBe('Insufficient stock for "Instant Noodles". Only 10 left.');
    expect(await stockOf(noodles.id)).toBe(10);
  });

  it('allows selling the last unit, then reports out of stock', async () => {
    const one = await createProduct({ name: 'Last One', stock: 1 });
    expect((await sale({ items: [{ productId: one.id, quantity: 1 }], payment: { method: 'CASH', amount: 10000 } })).status).toBe(201);
    expect(await stockOf(one.id)).toBe(0);
    const again = await sale({ items: [{ productId: one.id, quantity: 1 }], payment: { method: 'CASH', amount: 10000 } });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe('"Last One" is out of stock.');
  });

  it('rejects inactive products, unknown products, empty carts and bad quantities', async () => {
    const inactive = await createProduct({ isActive: false });
    const cases = [
      { items: [{ productId: inactive.id, quantity: 1 }], payment: { method: 'CASH', amount: 99999 } },
      { items: [{ productId: 99999, quantity: 1 }], payment: { method: 'CASH', amount: 99999 } },
      { items: [], payment: { method: 'CASH', amount: 0 } },
      { items: [{ productId: water.id, quantity: 0 }], payment: { method: 'CASH', amount: 99999 } },
      { items: [{ productId: water.id, quantity: -1 }], payment: { method: 'CASH', amount: 99999 } },
      { items: [{ productId: water.id, quantity: 1 }], payment: { method: 'BITCOIN', amount: 99999 } },
      { items: [{ productId: water.id, quantity: 1 }], payment: { method: 'CASH', amount: -1 } },
    ];
    for (const body of cases) {
      const res = await sale(body);
      expect(res.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    expect(await prisma.transaction.count()).toBe(0);
  });

  it('uses database prices, not client-supplied ones, and detects price changes', async () => {
    // A client cannot inject its own price
    const res = await sale({
      items: [{ productId: water.id, quantity: 1, unitPrice: 1 }],
      payment: { method: 'CASH', amount: 3000 },
    });
    expect(res.body.total).toBe(3000);

    // Price changed after the cashier built the cart
    await prisma.product.update({ where: { id: water.id }, data: { sellingPrice: 3200 } });
    const stale = await sale({
      items: [{ productId: water.id, quantity: 1 }],
      expectedTotal: 3000,
      payment: { method: 'CASH', amount: 5000 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('TOTAL_CHANGED');
    expect(stale.body.error.total).toBe(3200);
  });

  it('rolls back everything when the stock check fails for one of several items', async () => {
    const res = await sale({
      items: [
        { productId: water.id, quantity: 5 },
        { productId: noodles.id, quantity: 999 },
      ],
      payment: { method: 'CASH', amount: 9999999 },
    });
    expect(res.status).toBe(409);
    expect(await stockOf(water.id)).toBe(50);
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { type: 'SALE' } })).toBe(0);
    // The sequence counter rolled back too: the next sale gets number 0001
    const next = await sale({ items: [{ productId: water.id, quantity: 1 }], payment: { method: 'CASH', amount: 3000 } });
    expect(next.body.number).toBe(`INV-${today()}-0001`);
  });

  it('rolls back transaction, items, payment and stock if a later step fails', async () => {
    // Simulate a failure AFTER the transaction, items, payment and stock update were written:
    // a trigger makes inserting the inventory movement for this product fail.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_movement() RETURNS trigger AS $$
      BEGIN
        IF NEW."productId" = ${noodles.id} THEN RAISE EXCEPTION 'simulated failure'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER fail_movement_trg BEFORE INSERT ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION fail_movement()`,
    );
    try {
      const res = await sale({
        items: [
          { productId: water.id, quantity: 2 },
          { productId: noodles.id, quantity: 1 },
        ],
        payment: { method: 'CASH', amount: 10000 },
      });
      expect(res.status).toBe(500);
      // No technical details leak to the client
      expect(res.body.error.message).toBe('Something went wrong. Please try again.');
      expect(JSON.stringify(res.body)).not.toContain('simulated');

      expect(await prisma.transaction.count()).toBe(0);
      expect(await prisma.transactionItem.count()).toBe(0);
      expect(await prisma.payment.count()).toBe(0);
      expect(await prisma.inventoryMovement.count()).toBe(0);
      expect(await stockOf(water.id)).toBe(50);
      expect(await stockOf(noodles.id)).toBe(10);
      expect(await prisma.activityLog.count({ where: { action: 'TRANSACTION_COMPLETED' } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_movement_trg ON "InventoryMovement"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_movement()`);
    }
  });

  it('prevents overselling under concurrent checkouts and keeps numbers unique', async () => {
    const scarce = await createProduct({ name: 'Scarce', stock: 3 });
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        sale({ items: [{ productId: scarce.id, quantity: 1 }], payment: { method: 'CASH', amount: 10000 } }),
      ),
    );
    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(3);
    expect(rejected).toHaveLength(5);
    expect(await stockOf(scarce.id)).toBe(0);

    const numbers = ok.map((r) => r.body.number).sort();
    expect(new Set(numbers).size).toBe(3);
    expect(numbers).toEqual([`INV-${today()}-0001`, `INV-${today()}-0002`, `INV-${today()}-0003`]);
  });

  it('generates sequential transaction numbers across cashiers', async () => {
    const body = { items: [{ productId: water.id, quantity: 1 }], payment: { method: 'CASH', amount: 3000 } };
    const a = await sale(body);
    const b = await admin.post('/api/transactions', body);
    const c = await sale(body);
    expect([a.body.number, b.body.number, c.body.number]).toEqual([
      `INV-${today()}-0001`,
      `INV-${today()}-0002`,
      `INV-${today()}-0003`,
    ]);
  });

  it('is idempotent for a repeated clientRef (double-click / retry safe)', async () => {
    const body = {
      clientRef: 'c0ffee00-1111-2222-3333-444455556666',
      items: [{ productId: water.id, quantity: 1 }],
      payment: { method: 'CASH', amount: 3000 },
    };
    const [first, second] = await Promise.all([sale(body), sale(body)]);
    expect([first.status, second.status].sort()).toEqual([201, 201]);
    expect(first.body.id).toBe(second.body.id);
    expect(await prisma.transaction.count()).toBe(1);
    expect(await stockOf(water.id)).toBe(49);
  });

  it('snapshots product data on the sale so later edits do not change history', async () => {
    const res = await sale({ items: [{ productId: water.id, quantity: 1 }], payment: { method: 'CASH', amount: 3000 } });
    await prisma.product.update({ where: { id: water.id }, data: { name: 'Renamed', sellingPrice: 9999, purchasePrice: 9000 } });
    const detail = await admin.get(`/api/transactions/${res.body.id}`);
    expect(detail.body.items[0]).toMatchObject({ productName: 'Bottled Water', unitPrice: 3000, purchasePrice: 2400 });
  });

  it('lets an admin void a sale, returning stock exactly once', async () => {
    const res = await sale({ items: [{ productId: water.id, quantity: 4 }], payment: { method: 'CASH', amount: 12000 } });
    expect(await stockOf(water.id)).toBe(46);

    const voided = await admin.post(`/api/transactions/${res.body.id}/void`, { reason: 'Customer returned items' });
    expect(voided.status).toBe(200);
    expect(voided.body).toMatchObject({ status: 'VOIDED', voidReason: 'Customer returned items', voidedBy: { name: 'Admin' } });
    expect(await stockOf(water.id)).toBe(50);
    const movement = await prisma.inventoryMovement.findFirstOrThrow({ where: { type: 'VOID_RETURN' } });
    expect(movement).toMatchObject({ previousStock: 46, newStock: 50, quantityChange: 4 });

    const again = await admin.post(`/api/transactions/${res.body.id}/void`, { reason: 'Twice' });
    expect(again.status).toBe(409);
    expect(await stockOf(water.id)).toBe(50);
  });

  it('filters transaction history', async () => {
    const body = { items: [{ productId: water.id, quantity: 1 }], payment: { method: 'CASH', amount: 3000 } };
    await sale(body);
    await sale({ ...body, payment: { method: 'QRIS', amount: 3000 } });
    const qris = await admin.get('/api/transactions?paymentMethod=QRIS');
    expect(qris.body.total).toBe(1);
    expect(qris.body.data[0].paymentMethods).toEqual(['QRIS']);

    const search = await admin.get(`/api/transactions?search=${today()}-0002`);
    expect(search.body.total).toBe(1);

    const future = new Date(Date.now() + 86_400_000).toISOString();
    const none = await admin.get(`/api/transactions?from=${future}`);
    expect(none.body.total).toBe(0);
  });
});
