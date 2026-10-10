// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
const { receiptHtml } = await import('./print');

const data = {
  store: { name: 'Toko <Maju>', address: 'Jl. A & B' },
  number: 'INV-20261007-0001',
  date: '2026-10-07T07:32:00Z',
  timezone: 'Asia/Jakarta',
  cashier: 'John',
  items: [{ name: 'Water', quantity: 2, unitPrice: 3000, subtotal: 6000 }],
  subtotal: 6000,
  discountAmount: 0,
  taxAmount: 0,
  total: 6000,
  payments: [{ method: 'CASH' as const, amount: 10000 }],
  amountPaid: 10000,
  change: 4000,
};

describe('thermal receipt HTML', () => {
  it('sizes the page for 58mm and 80mm paper', () => {
    expect(receiptHtml(data, '58')).toContain('width: 48mm');
    expect(receiptHtml(data, '80')).toContain('width: 72mm');
    expect(receiptHtml(data, '58')).toContain('@page { margin: 0; }');
  });

  it('escapes HTML in store data', () => {
    const html = receiptHtml(data, '58');
    expect(html).toContain('TOKO &lt;MAJU&gt;');
    expect(html).toContain('Jl. A &amp; B');
    expect(html).not.toContain('<MAJU>');
  });

  it('includes the logo only when given', () => {
    expect(receiptHtml(data, '58')).not.toContain('<img');
    expect(receiptHtml(data, '58', '/uploads/logo.png')).toContain('src="http://localhost:5173/uploads/logo.png"');
  });
});
