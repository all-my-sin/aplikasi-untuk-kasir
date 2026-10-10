/**
 * Development seed data. Run with `npm run db:seed`.
 *
 * The credentials created here (admin/admin123, cashier/cashier123) are for
 * DEVELOPMENT ONLY. Change or remove these accounts before going live.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { calculateTotals } from '@pos/shared';

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: 'Beverages', description: 'Drinks, water, coffee and tea' },
  { name: 'Snacks', description: 'Chips, biscuits and confectionery' },
  { name: 'Instant Food', description: 'Instant noodles and ready meals' },
  { name: 'Household', description: 'Cleaning and household supplies' },
  { name: 'Personal Care', description: 'Toiletries and hygiene products' },
  { name: 'Stationery', description: 'Office and school supplies' },
];

// [sku, barcode, name, category, purchase, selling, stock, minStock, unit]
const PRODUCTS: [string, string, string, string, number, number, number, number, string][] = [
  ['BEV-001', '8991002101234', 'Bottled Water 600ml', 'Beverages', 2400, 3000, 120, 24, 'bottle'],
  ['BEV-002', '8991002105678', 'Bottled Water 1500ml', 'Beverages', 4500, 6000, 48, 12, 'bottle'],
  ['BEV-003', '8992761111111', 'Iced Tea 350ml', 'Beverages', 3200, 4500, 60, 12, 'bottle'],
  ['BEV-004', '8992761222222', 'Instant Coffee Sachet', 'Beverages', 1200, 2000, 8, 20, 'sachet'],
  ['SNK-001', '8996001300011', 'Potato Chips 68g', 'Snacks', 7500, 10500, 35, 10, 'pack'],
  ['SNK-002', '8996001300028', 'Chocolate Wafer', 'Snacks', 1500, 2500, 90, 20, 'pcs'],
  ['SNK-003', '8996001300035', 'Butter Cookies 150g', 'Snacks', 14000, 19500, 0, 5, 'tin'],
  ['INS-001', '089686010947', 'Instant Noodles Fried', 'Instant Food', 2600, 3500, 200, 40, 'pack'],
  ['INS-002', '089686010954', 'Instant Noodles Chicken Soup', 'Instant Food', 2500, 3300, 15, 40, 'pack'],
  ['INS-003', '8998866200011', 'Canned Sardines 155g', 'Instant Food', 8200, 11000, 24, 6, 'can'],
  ['HOU-001', '8999999001112', 'Dish Soap 800ml', 'Household', 11500, 15000, 18, 5, 'bottle'],
  ['HOU-002', '8999999001129', 'Laundry Detergent 1kg', 'Household', 19000, 24500, 3, 5, 'pack'],
  ['HOU-003', '8999999001136', 'Tissue Roll (4 pack)', 'Household', 13000, 17500, 30, 8, 'pack'],
  ['PRC-001', '8992694241112', 'Toothpaste 190g', 'Personal Care', 9800, 13500, 25, 6, 'tube'],
  ['PRC-002', '8992694241129', 'Bath Soap 85g', 'Personal Care', 2900, 4000, 0, 10, 'pcs'],
  ['PRC-003', '8992694241136', 'Shampoo Sachet', 'Personal Care', 700, 1000, 150, 30, 'sachet'],
  ['STA-001', '8993988100011', 'Ballpoint Pen Black', 'Stationery', 1800, 3000, 64, 12, 'pcs'],
  ['STA-002', '8993988100028', 'Notebook A5 58 Sheets', 'Stationery', 3500, 5500, 4, 10, 'pcs'],
];

async function main() {
  const rounds = 12;
  const [adminHash, cashierHash] = await Promise.all([
    bcrypt.hash('admin123', rounds),
    bcrypt.hash('cashier123', rounds),
  ]);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { name: 'Store Admin', username: 'admin', email: 'admin@example.com', passwordHash: adminHash, role: 'ADMIN' },
  });
  const cashier = await prisma.user.upsert({
    where: { username: 'cashier' },
    update: {},
    create: { name: 'John Cashier', username: 'cashier', passwordHash: cashierHash, role: 'CASHIER' },
  });

  await prisma.storeSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      storeName: 'Toko Sejahtera',
      address: 'Jl. Merdeka No. 10, Jakarta',
      phone: '0812-3456-7890',
      email: 'hello@example.com',
      receiptFooter: 'Thank you for shopping!\nGoods sold are non-refundable.',
      receiptPaperSize: '58',
      timezone: 'Asia/Jakarta',
    },
  });

  const categoryIds = new Map<string, number>();
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({ where: { name: c.name }, update: {}, create: c });
    categoryIds.set(c.name, cat.id);
  }

  for (const [sku, barcode, name, category, purchasePrice, sellingPrice, stock, minStock, unit] of PRODUCTS) {
    const existing = await prisma.product.findUnique({ where: { sku } });
    if (existing) continue;
    const product = await prisma.product.create({
      data: { sku, barcode, name, categoryId: categoryIds.get(category), purchasePrice, sellingPrice, stock, minStock, unit },
    });
    if (stock > 0) {
      await prisma.inventoryMovement.create({
        data: {
          productId: product.id,
          type: 'INITIAL',
          quantityChange: stock,
          previousStock: 0,
          newStock: stock,
          reason: 'Opening stock (seed)',
          userId: admin.id,
        },
      });
    }
  }

  if ((await prisma.transaction.count()) === 0) await seedSampleSales(cashier.id);

  console.log('Seed complete.');
  console.log('  admin   / admin123    (ADMIN)   — development only');
  console.log('  cashier / cashier123  (CASHIER) — development only');
}

/** Creates ~2 weeks of realistic past sales (with matching stock movements). */
async function seedSampleSales(cashierId: number) {
  const products = await prisma.product.findMany({ where: { stock: { gt: 30 } } });
  if (products.length === 0) return;
  const stock = new Map(products.map((p) => [p.id, p.stock]));
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const methods = ['CASH', 'CASH', 'CASH', 'QRIS', 'DEBIT_CARD', 'BANK_TRANSFER'] as const;

  for (let daysAgo = 13; daysAgo >= 1; daysAgo--) {
    const count = 2 + Math.floor(rand() * 4);
    for (let n = 1; n <= count; n++) {
      const createdAt = new Date(Date.now() - daysAgo * 86_400_000);
      createdAt.setUTCHours(2 + Math.floor(rand() * 10), Math.floor(rand() * 60), 0, 0); // 09:00–19:00 WIB
      const picked = [...products].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 3));
      const lines = picked
        .map((p) => ({ p, qty: 1 + Math.floor(rand() * 3) }))
        .filter((l) => (stock.get(l.p.id) ?? 0) >= l.qty);
      if (lines.length === 0) continue;

      const totals = calculateTotals({
        items: lines.map((l) => ({ unitPrice: l.p.sellingPrice, purchasePrice: l.p.purchasePrice, quantity: l.qty })),
      });
      const method = methods[Math.floor(rand() * methods.length)];
      const paid = method === 'CASH' ? Math.ceil(totals.total / 5000) * 5000 : totals.total;
      const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })
        .format(createdAt)
        .replace(/-/g, '');
      const seq = await prisma.dailySequence.upsert({
        where: { date: dateKey },
        update: { last: { increment: 1 } },
        create: { date: dateKey, last: 1 },
      });
      const number = `INV-${dateKey}-${String(seq.last).padStart(4, '0')}`;

      await prisma.$transaction(async (tx) => {
        const t = await tx.transaction.create({
          data: {
            number,
            cashierId,
            subtotal: totals.subtotal,
            total: totals.total,
            totalCost: totals.totalCost,
            amountPaid: paid,
            change: paid - totals.total,
            itemCount: totals.itemCount,
            createdAt,
            items: {
              create: lines.map((l) => ({
                productId: l.p.id,
                productName: l.p.name,
                sku: l.p.sku,
                unit: l.p.unit,
                unitPrice: l.p.sellingPrice,
                purchasePrice: l.p.purchasePrice,
                quantity: l.qty,
                subtotal: l.p.sellingPrice * l.qty,
              })),
            },
            payments: { create: { method, amount: paid, createdAt } },
          },
        });
        for (const l of lines) {
          const previous = stock.get(l.p.id)!;
          stock.set(l.p.id, previous - l.qty);
          await tx.product.update({ where: { id: l.p.id }, data: { stock: { decrement: l.qty } } });
          await tx.inventoryMovement.create({
            data: {
              productId: l.p.id,
              type: 'SALE',
              quantityChange: -l.qty,
              previousStock: previous,
              newStock: previous - l.qty,
              reason: `Sale ${number}`,
              userId: cashierId,
              transactionId: t.id,
              createdAt,
            },
          });
        }
      });
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
