import ExcelJS from 'exceljs';
import { PAYMENT_METHOD_LABELS, UTF8_BOM, formatReceiptDate, toCsv } from '@pos/shared';
import type { DateRange } from '../validators/common';
import { bestSellers, dailySales, salesSummary, transactionRows } from './reports.service';

export type ReportType = 'sales' | 'products' | 'transactions';
export type ExportFormat = 'csv' | 'xlsx';

interface Sheet {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
  /** Column indexes holding money values (formatted as Rp in Excel). */
  money?: number[];
}

async function buildSheets(type: ReportType, range: DateRange, tz: string): Promise<Sheet[]> {
  if (type === 'sales') {
    const [summary, daily] = await Promise.all([salesSummary(range), dailySales(range, tz)]);
    return [
      {
        name: 'Daily sales',
        headers: ['Date', 'Transactions', 'Revenue', 'Gross profit'],
        rows: daily.map((d) => [d.date, d.transactions, d.revenue, d.profit]),
        money: [2, 3],
      },
      {
        name: 'Summary',
        headers: ['Metric', 'Value'],
        rows: [
          ['Period start', formatReceiptDate(range.from, tz)],
          ['Period end', formatReceiptDate(range.to, tz)],
          ['Transactions', summary.transactions],
          ['Items sold', summary.itemsSold],
          ['Gross sales', summary.grossSales],
          ['Discounts', summary.discounts],
          ['Net sales (revenue)', summary.netSales],
          ['Tax collected', summary.tax],
          ['Total collected', summary.totalCollected],
          ['Cost of goods sold', summary.cogs],
          ['Gross profit', summary.grossProfit],
          ['Profit margin %', summary.margin],
          ['Average transaction', summary.averageTransaction],
        ],
      },
    ];
  }

  if (type === 'products') {
    const rows = await bestSellers(range, 1000);
    return [
      {
        name: 'Best sellers',
        headers: ['Rank', 'SKU', 'Product', 'Quantity sold', 'Revenue', 'Gross profit'],
        rows: rows.map((r) => [r.rank, r.sku, r.name, r.quantity, r.revenue, r.profit]),
        money: [4, 5],
      },
    ];
  }

  const rows = await transactionRows(range);
  return [
    {
      name: 'Transactions',
      headers: [
        'Number',
        'Date',
        'Cashier',
        'Status',
        'Items',
        'Payment',
        'Subtotal',
        'Discount',
        'Tax',
        'Total',
        'Cost',
        'Gross profit',
      ],
      rows: rows.map((t) => [
        t.number,
        formatReceiptDate(t.createdAt, tz),
        t.cashier.name,
        t.status,
        t.itemCount,
        t.payments.map((p) => PAYMENT_METHOD_LABELS[p.method]).join(', '),
        t.subtotal,
        t.discountAmount,
        t.taxAmount,
        t.total,
        t.totalCost,
        t.subtotal - t.discountAmount - t.totalCost,
      ]),
      money: [6, 7, 8, 9, 10, 11],
    },
  ];
}

export async function exportReport(type: ReportType, format: ExportFormat, range: DateRange, tz: string) {
  const sheets = await buildSheets(type, range, tz);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${type}-report-${stamp}`;

  if (format === 'csv') {
    // CSV holds one table; the summary of a sales report is appended after a blank line.
    const body = sheets.map((s) => toCsv(s.headers, s.rows)).join('\r\n');
    return { filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8', body: Buffer.from(UTF8_BOM + body, 'utf8') };
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Retail POS';
  workbook.created = new Date();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    ws.addRow(sheet.headers).font = { bold: true };
    ws.addRows(sheet.rows);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.headers.forEach((header, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(12, header.length + 4);
      if (sheet.money?.includes(i)) col.numFmt = '"Rp"#,##0';
    });
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    filename: `${base}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: buffer,
  };
}
