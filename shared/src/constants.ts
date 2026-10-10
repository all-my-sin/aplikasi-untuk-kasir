export const ROLES = ['ADMIN', 'CASHIER'] as const;
export type RoleValue = (typeof ROLES)[number];

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'QRIS', 'DEBIT_CARD', 'CREDIT_CARD'] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodValue, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  QRIS: 'QRIS',
  DEBIT_CARD: 'Debit Card',
  CREDIT_CARD: 'Credit Card',
};

export const MOVEMENT_TYPES = [
  'INITIAL',
  'SALE',
  'RESTOCK',
  'REMOVE',
  'ADJUSTMENT',
  'OPNAME',
  'VOID_RETURN',
  'IMPORT',
] as const;
export type MovementTypeValue = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_TYPE_LABELS: Record<MovementTypeValue, string> = {
  INITIAL: 'Opening stock',
  SALE: 'Sale',
  RESTOCK: 'Restock',
  REMOVE: 'Stock removed',
  ADJUSTMENT: 'Adjustment',
  OPNAME: 'Stock opname',
  VOID_RETURN: 'Void return',
  IMPORT: 'CSV import',
};

export const TRANSACTION_STATUSES = ['COMPLETED', 'VOIDED'] as const;
export type TransactionStatusValue = (typeof TRANSACTION_STATUSES)[number];

export const STOCK_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  IN_STOCK: 'In Stock',
  LOW_STOCK: 'Low Stock',
  OUT_OF_STOCK: 'Out of Stock',
};

/** Out of stock at 0, low stock at or below the minimum, otherwise in stock. */
export function getStockStatus(stock: number, minStock: number): StockStatus {
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock <= minStock) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export const PAPER_SIZES = ['58', '80'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

/** Characters per line for common thermal printers using the default font. */
export const RECEIPT_WIDTH: Record<PaperSize, number> = { '58': 32, '80': 48 };
