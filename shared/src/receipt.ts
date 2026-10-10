// Plain-text receipt layout for thermal printers.
// Thermal printers print fixed-width characters (32 per line on 58mm paper,
// 48 on 80mm), so the receipt is composed as monospace text lines. The frontend
// renders these lines inside a <pre> with a print stylesheet sized to the paper.

import { PAYMENT_METHOD_LABELS, type PaperSize, type PaymentMethodValue, RECEIPT_WIDTH } from './constants';
import { formatNumber } from './money';

export interface ReceiptData {
  store: {
    name: string;
    address?: string | null;
    phone?: string | null;
    header?: string | null;
    footer?: string | null;
  };
  number: string;
  date: string | Date;
  timezone?: string;
  cashier: string;
  status?: 'COMPLETED' | 'VOIDED';
  items: { name: string; quantity: number; unitPrice: number; subtotal: number }[];
  subtotal: number;
  discountAmount: number;
  taxRate?: number;
  taxAmount: number;
  total: number;
  payments: { method: PaymentMethodValue; amount: number }[];
  amountPaid: number;
  change: number;
  reprint?: boolean;
}

export function formatReceiptDate(date: string | Date, timezone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

/** Word-wraps text to `width` characters, hard-breaking words that are too long. */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (let word of words) {
      while (word.length > width) {
        if (current) {
          lines.push(current);
          current = '';
        }
        lines.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (!word) continue;
      if (!current) current = word;
      else if (current.length + 1 + word.length <= width) current += ` ${word}`;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export function centerText(text: string, width: number): string[] {
  return wrapText(text, width).map((line) => {
    const pad = Math.floor((width - line.length) / 2);
    return ' '.repeat(Math.max(0, pad)) + line;
  });
}

/** Left label + right-aligned value on one line (value wins if space is short). */
export function justify(left: string, right: string, width: number): string {
  const space = width - left.length - right.length;
  if (space >= 1) return left + ' '.repeat(space) + right;
  const maxLeft = Math.max(0, width - right.length - 1);
  return `${left.slice(0, maxLeft)} ${right}`.slice(0, Math.max(width, right.length));
}

export function buildReceiptLines(data: ReceiptData, paperSize: PaperSize = '58'): string[] {
  const width = RECEIPT_WIDTH[paperSize];
  const heavy = '='.repeat(width);
  const light = '-'.repeat(width);
  const lines: string[] = [];

  lines.push(heavy);
  lines.push(...centerText(data.store.name.toUpperCase(), width));
  if (data.store.address) lines.push(...centerText(data.store.address, width));
  if (data.store.phone) lines.push(...centerText(data.store.phone, width));
  if (data.store.header) lines.push(...centerText(data.store.header, width));
  lines.push(heavy);
  if (data.status === 'VOIDED') lines.push(...centerText('*** VOIDED ***', width));
  if (data.reprint) lines.push(...centerText('-- REPRINT --', width));
  lines.push('');

  lines.push(...wrapText(`Transaction: ${data.number}`, width));
  lines.push(`Date: ${formatReceiptDate(data.date, data.timezone)}`);
  lines.push(...wrapText(`Cashier: ${data.cashier}`, width));
  lines.push('');

  lines.push(light);
  // Column header: product name on its own line, then "qty x price      subtotal"
  lines.push(justify('Product', 'Amount', width));
  lines.push(light);
  for (const item of data.items) {
    lines.push(...wrapText(item.name, width));
    lines.push(justify(`  ${item.quantity} x ${formatNumber(item.unitPrice)}`, formatNumber(item.subtotal), width));
  }
  lines.push(light);
  lines.push('');

  lines.push(justify('Subtotal:', formatNumber(data.subtotal), width));
  if (data.discountAmount > 0) lines.push(justify('Discount:', `-${formatNumber(data.discountAmount)}`, width));
  if (data.taxAmount > 0) {
    const label = data.taxRate ? `Tax (${data.taxRate}%):` : 'Tax:';
    lines.push(justify(label, formatNumber(data.taxAmount), width));
  }
  lines.push(justify('TOTAL:', formatNumber(data.total), width));
  lines.push('');

  if (data.payments.length === 1) {
    lines.push(justify('Payment:', PAYMENT_METHOD_LABELS[data.payments[0].method], width));
  } else {
    for (const payment of data.payments) {
      lines.push(justify(`${PAYMENT_METHOD_LABELS[payment.method]}:`, formatNumber(payment.amount), width));
    }
  }
  lines.push(justify('Paid:', formatNumber(data.amountPaid), width));
  lines.push(justify('Change:', formatNumber(data.change), width));
  lines.push('');

  lines.push(heavy);
  lines.push(...centerText(data.store.footer?.trim() || 'THANK YOU', width));
  lines.push(heavy);
  return lines;
}
