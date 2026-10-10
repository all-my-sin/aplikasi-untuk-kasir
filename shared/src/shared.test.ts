import { describe, expect, it } from 'vitest';
import {
  buildReceiptLines,
  calculateChange,
  calculateDiscount,
  calculateItemProfit,
  calculateMargin,
  calculateTotals,
  checkoutSchema,
  formatRupiah,
  getStockStatus,
  parseCsv,
  parseCsvObjects,
  productSchema,
  toCsv,
  UTF8_BOM,
  wrapText,
} from './index';

describe('formatRupiah', () => {
  it('formats with dot thousands separators and no space', () => {
    expect(formatRupiah(10000)).toBe('Rp10.000');
    expect(formatRupiah(25500)).toBe('Rp25.500');
    expect(formatRupiah(125000)).toBe('Rp125.000');
    expect(formatRupiah(1234567890)).toBe('Rp1.234.567.890');
    expect(formatRupiah(0)).toBe('Rp0');
    expect(formatRupiah(999)).toBe('Rp999');
    expect(formatRupiah(-5000)).toBe('-Rp5.000');
  });
});

describe('calculateTotals', () => {
  const items = [
    { unitPrice: 10000, quantity: 2, purchasePrice: 7000 },
    { unitPrice: 15000, quantity: 1, purchasePrice: 12000 },
  ];

  it('computes subtotal, item count and cost', () => {
    const t = calculateTotals({ items });
    expect(t.subtotal).toBe(35000);
    expect(t.itemCount).toBe(3);
    expect(t.totalCost).toBe(26000);
    expect(t.total).toBe(35000);
  });

  it('applies a fixed amount discount', () => {
    const t = calculateTotals({ items, discountType: 'AMOUNT', discountValue: 5000 });
    expect(t.discountAmount).toBe(5000);
    expect(t.total).toBe(30000);
  });

  it('applies a percentage discount with rounding', () => {
    const t = calculateTotals({ items, discountType: 'PERCENT', discountValue: 10 });
    expect(t.discountAmount).toBe(3500);
    expect(t.total).toBe(31500);
    expect(calculateDiscount(33333, 'PERCENT', 10)).toBe(3333);
  });

  it('never discounts more than the subtotal', () => {
    expect(calculateTotals({ items, discountType: 'AMOUNT', discountValue: 99999 }).total).toBe(0);
    expect(calculateDiscount(1000, 'PERCENT', 250)).toBe(1000);
  });

  it('applies tax after discount', () => {
    const t = calculateTotals({ items, discountType: 'AMOUNT', discountValue: 5000, taxRate: 11 });
    expect(t.taxableAmount).toBe(30000);
    expect(t.taxAmount).toBe(3300);
    expect(t.total).toBe(33300);
  });

  it('handles an empty cart', () => {
    expect(calculateTotals({ items: [] }).total).toBe(0);
  });
});

describe('calculateChange', () => {
  it('returns change for sufficient payment', () => {
    expect(calculateChange(50000, 60000)).toBe(10000);
    expect(calculateChange(50000, 50000)).toBe(0);
  });
  it('returns null for insufficient payment', () => {
    expect(calculateChange(50000, 49999)).toBeNull();
  });
});

describe('profit', () => {
  it('computes item profit and margin', () => {
    expect(calculateItemProfit(3000, 2400, 250)).toBe(150000);
    expect(calculateMargin(150000, 750000)).toBe(20);
    expect(calculateMargin(100, 0)).toBe(0);
  });
});

describe('getStockStatus', () => {
  it('classifies stock levels', () => {
    expect(getStockStatus(0, 5)).toBe('OUT_OF_STOCK');
    expect(getStockStatus(5, 5)).toBe('LOW_STOCK');
    expect(getStockStatus(6, 5)).toBe('IN_STOCK');
    expect(getStockStatus(1, 0)).toBe('IN_STOCK');
  });
});

describe('receipt', () => {
  const data = {
    store: { name: 'Toko Maju', address: 'Jl. Merdeka No. 1, Jakarta', phone: '021-555', footer: 'Terima kasih' },
    number: 'INV-20261007-0001',
    date: '2026-10-07T07:32:00Z',
    timezone: 'Asia/Jakarta',
    cashier: 'John',
    items: [
      { name: 'Product A', quantity: 2, unitPrice: 10000, subtotal: 20000 },
      { name: 'A very long product name that needs wrapping on small paper', quantity: 1, unitPrice: 35000, subtotal: 35000 },
    ],
    subtotal: 55000,
    discountAmount: 5000,
    taxAmount: 0,
    total: 50000,
    payments: [{ method: 'CASH' as const, amount: 60000 }],
    amountPaid: 60000,
    change: 10000,
  };

  it.each([
    ['58', 32],
    ['80', 48],
  ] as const)('fits every line in %smm paper (%i chars)', (size, width) => {
    const lines = buildReceiptLines(data, size);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(width);
    expect(lines[0]).toBe('='.repeat(width));
  });

  it('contains the key information', () => {
    const text = buildReceiptLines(data, '58').join('\n');
    expect(text).toContain('TOKO MAJU');
    expect(text).toContain('Transaction: INV-20261007-0001');
    expect(text).toContain('Date: 07/10/2026 14:32');
    expect(text).toContain('Cashier: John');
    expect(text).toMatch(/TOTAL:\s+50\.000/);
    expect(text).toMatch(/Change:\s+10\.000/);
    expect(text).toMatch(/Discount:\s+-5\.000/);
    expect(text).toContain('Terima kasih');
  });

  it('wraps long words', () => {
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapText('aa bb cc', 5)).toEqual(['aa bb', 'cc']);
  });
});

describe('csv', () => {
  it('round-trips quoted values', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'he said "hi"'], [1, null]]);
    expect(parseCsv(csv)).toEqual([
      ['a', 'b'],
      ['x,y', 'he said "hi"'],
      ['1', ''],
    ]);
  });
  it('neutralises formula injection', () => {
    expect(toCsv(['a'], [['=SUM(A1)']])).toContain("'=SUM(A1)");
    expect(toCsv(['a'], [[-5]])).toContain('-5');
  });
  it('parses objects with case-insensitive headers', () => {
    expect(parseCsvObjects('SKU,Name\r\nA1,Water\r\n')).toEqual([{ sku: 'A1', name: 'Water' }]);
  });
  it('ignores a leading UTF-8 byte-order mark (Excel exports)', () => {
    expect(parseCsvObjects(`${UTF8_BOM}sku,name\nA1,Water`)).toEqual([{ sku: 'A1', name: 'Water' }]);
  });
});

describe('schemas', () => {
  it('rejects negative prices and blank SKUs', () => {
    const r = productSchema.safeParse({ sku: '', name: 'X', purchasePrice: -1, sellingPrice: 1, unit: 'pcs' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('sku');
      expect(paths).toContain('purchasePrice');
    }
  });
  it('normalises empty barcode to null', () => {
    const r = productSchema.parse({ sku: 'A', barcode: '', name: 'X', purchasePrice: 1, sellingPrice: 2, unit: 'pcs' });
    expect(r.barcode).toBeNull();
    expect(r.stock).toBe(0);
  });
  it('rejects zero quantities and over-100% discounts in checkout', () => {
    expect(
      checkoutSchema.safeParse({ items: [{ productId: 1, quantity: 0 }], payment: { method: 'CASH', amount: 0 } }).success,
    ).toBe(false);
    expect(
      checkoutSchema.safeParse({
        items: [{ productId: 1, quantity: 1 }],
        discountType: 'PERCENT',
        discountValue: 101,
        payment: { method: 'CASH', amount: 0 },
      }).success,
    ).toBe(false);
  });
});
