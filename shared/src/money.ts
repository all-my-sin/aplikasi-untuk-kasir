// Money helpers shared by the frontend (live cart preview) and the backend
// (authoritative checkout calculation). All amounts are integers in IDR.

export type DiscountTypeValue = 'AMOUNT' | 'PERCENT';

/** Formats an integer with Indonesian thousands separators: 125000 -> "125.000" */
export function formatNumber(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sign + digits;
}

/** Formats an amount as Indonesian Rupiah: 10000 -> "Rp10.000", -5000 -> "-Rp5.000" */
export function formatRupiah(value: number): string {
  const rounded = Math.round(value);
  if (rounded < 0) return `-Rp${formatNumber(-rounded)}`;
  return `Rp${formatNumber(rounded)}`;
}

export interface TotalsLine {
  unitPrice: number;
  quantity: number;
  purchasePrice?: number;
}

export interface TotalsInput {
  items: TotalsLine[];
  discountType?: DiscountTypeValue | null;
  discountValue?: number;
  /** Tax rate in percent (e.g. 11 for 11%). Pass 0 when tax is disabled. */
  taxRate?: number;
}

export interface Totals {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
  totalCost: number;
  itemCount: number;
}

/** Computes the discount for a subtotal. Never exceeds the subtotal. */
export function calculateDiscount(
  subtotal: number,
  discountType: DiscountTypeValue | null | undefined,
  discountValue: number | undefined,
): number {
  const value = Math.max(0, discountValue ?? 0);
  if (!discountType || value === 0 || subtotal <= 0) return 0;
  const raw = discountType === 'PERCENT' ? Math.round((subtotal * Math.min(value, 100)) / 100) : Math.round(value);
  return Math.min(raw, subtotal);
}

/**
 * Cart totals. Order of operations:
 *   subtotal = Σ unitPrice × qty
 *   discount = fixed amount or % of subtotal (capped at subtotal)
 *   tax      = round((subtotal − discount) × taxRate%)   (tax-exclusive pricing)
 *   total    = subtotal − discount + tax
 */
export function calculateTotals(input: TotalsInput): Totals {
  let subtotal = 0;
  let totalCost = 0;
  let itemCount = 0;
  for (const line of input.items) {
    subtotal += line.unitPrice * line.quantity;
    totalCost += (line.purchasePrice ?? 0) * line.quantity;
    itemCount += line.quantity;
  }
  const discountAmount = calculateDiscount(subtotal, input.discountType, input.discountValue);
  const taxableAmount = subtotal - discountAmount;
  const taxRate = Math.max(0, input.taxRate ?? 0);
  const taxAmount = Math.round((taxableAmount * taxRate) / 100);
  const total = taxableAmount + taxAmount;
  return { subtotal, discountAmount, taxableAmount, taxAmount, total, totalCost, itemCount };
}

/** change = amountPaid − total. Returns null when the payment is insufficient. */
export function calculateChange(total: number, amountPaid: number): number | null {
  if (amountPaid < total) return null;
  return amountPaid - total;
}

/** itemProfit = (sellingPrice − purchasePrice) × quantity */
export function calculateItemProfit(sellingPrice: number, purchasePrice: number, quantity: number): number {
  return (sellingPrice - purchasePrice) * quantity;
}

/** Profit margin as a percentage of revenue (0 when there is no revenue). */
export function calculateMargin(profit: number, revenue: number): number {
  if (revenue <= 0) return 0;
  return Math.round((profit / revenue) * 10000) / 100;
}
