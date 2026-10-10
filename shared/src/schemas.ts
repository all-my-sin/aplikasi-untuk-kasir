// Zod schemas shared by frontend forms and backend request validation.
import { z } from 'zod';
import { PAPER_SIZES, PAYMENT_METHODS, ROLES } from './constants';

const MAX_MONEY = 2_000_000_000;
const MAX_QTY = 1_000_000;

/** Optional free text: trims, and turns empty strings into null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

const money = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(MAX_MONEY, `${label} is too large`);

const stockNumber = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(MAX_QTY, `${label} is too large`);

const id = z.number().int().positive();

// ---------------------------------------------------------------- Auth
export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------- Categories
export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(100),
  description: optionalText(500),
  isActive: z.boolean().default(true),
});
export type CategoryInput = z.input<typeof categorySchema>;
export type CategoryData = z.output<typeof categorySchema>;

// ---------------------------------------------------------------- Products
export const productSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, 'SKU is required')
    .max(64, 'SKU must be at most 64 characters')
    .regex(/^\S+$/, 'SKU cannot contain spaces'),
  barcode: z
    .string()
    .trim()
    .max(64, 'Barcode must be at most 64 characters')
    .regex(/^\S*$/, 'Barcode cannot contain spaces')
    .nullish()
    .transform((v) => (v ? v : null)),
  name: z.string().trim().min(1, 'Product name is required').max(200),
  description: optionalText(1000),
  categoryId: id.nullish().transform((v) => v ?? null),
  purchasePrice: money('Purchase price'),
  sellingPrice: money('Selling price'),
  stock: stockNumber('Stock').default(0),
  minStock: stockNumber('Minimum stock').default(0),
  unit: z.string().trim().min(1, 'Unit is required').max(20),
  imageUrl: optionalText(500),
  isActive: z.boolean().default(true),
});
export type ProductInput = z.input<typeof productSchema>;
export type ProductData = z.output<typeof productSchema>;

/** Updating a product never changes stock directly — use inventory adjustments. */
export const productUpdateSchema = productSchema.omit({ stock: true });
export type ProductUpdateData = z.output<typeof productUpdateSchema>;

/** One row of a product CSV import (values arrive as strings). */
export const productImportRowSchema = z.object({
  sku: z.string(),
  barcode: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  purchasePrice: z.union([z.string(), z.number()]),
  sellingPrice: z.union([z.string(), z.number()]),
  stock: z.union([z.string(), z.number()]).optional(),
  minStock: z.union([z.string(), z.number()]).optional(),
  unit: z.string().optional(),
  isActive: z.union([z.string(), z.boolean()]).optional(),
});
export const productImportSchema = z.object({
  rows: z.array(productImportRowSchema).min(1, 'The file has no rows').max(5000, 'Import at most 5000 rows at a time'),
});
export type ProductImportRow = z.infer<typeof productImportRowSchema>;

// ---------------------------------------------------------------- Inventory
export const ADJUSTMENT_KINDS = ['ADD', 'REMOVE', 'SET'] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export const inventoryAdjustmentSchema = z
  .object({
    productId: id,
    kind: z.enum(ADJUSTMENT_KINDS),
    quantity: stockNumber('Quantity'),
    reason: z.string().trim().min(1, 'Reason is required').max(200),
  })
  .refine((v) => v.kind === 'SET' || v.quantity > 0, {
    message: 'Quantity must be greater than zero',
    path: ['quantity'],
  });
export type InventoryAdjustmentInput = z.infer<typeof inventoryAdjustmentSchema>;

export const stockOpnameSchema = z.object({
  items: z
    .array(z.object({ productId: id, countedStock: stockNumber('Counted stock') }))
    .min(1, 'Enter at least one counted product')
    .max(2000),
  note: optionalText(200),
});
export type StockOpnameInput = z.input<typeof stockOpnameSchema>;

// ---------------------------------------------------------------- Checkout
export const checkoutSchema = z
  .object({
    clientRef: z.string().trim().min(8).max(64).optional(),
    items: z
      .array(
        z.object({
          productId: id,
          quantity: z
            .number()
            .int('Quantity must be a whole number')
            .positive('Quantity must be greater than zero')
            .max(MAX_QTY),
        }),
      )
      .min(1, 'The cart is empty')
      .max(500, 'Too many items in one transaction'),
    discountType: z.enum(['AMOUNT', 'PERCENT']).nullish(),
    discountValue: z.number().min(0, 'Discount cannot be negative').max(MAX_MONEY).default(0),
    payment: z.object({
      method: z.enum(PAYMENT_METHODS),
      amount: money('Payment amount'),
      reference: optionalText(100),
    }),
    note: optionalText(500),
    /** Total shown to the cashier; checkout is rejected if prices changed meanwhile. */
    expectedTotal: z.number().int().min(0).optional(),
  })
  .refine((v) => v.discountType !== 'PERCENT' || v.discountValue <= 100, {
    message: 'Discount percentage cannot exceed 100%',
    path: ['discountValue'],
  })
  .refine((v) => new Set(v.items.map((i) => i.productId)).size === v.items.length, {
    message: 'Each product may appear only once in the cart',
    path: ['items'],
  });
export type CheckoutInput = z.input<typeof checkoutSchema>;

export const voidTransactionSchema = z.object({
  reason: z.string().trim().min(3, 'Please give a reason (at least 3 characters)').max(200),
});

// ---------------------------------------------------------------- Users
const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-z0-9._-]+$/, 'Use only letters, numbers, dots, dashes and underscores');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

const optionalEmail = z
  .union([z.literal(''), z.email('Enter a valid email address').max(200)])
  .nullish()
  .transform((v) => (v ? v.toLowerCase() : null));

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  username,
  email: optionalEmail,
  password,
  role: z.enum(ROLES),
  isActive: z.boolean().default(true),
});
export type UserCreateInput = z.input<typeof userCreateSchema>;

export const userUpdateSchema = userCreateSchema.omit({ password: true });
export type UserUpdateInput = z.input<typeof userUpdateSchema>;

export const userStatusSchema = z.object({ isActive: z.boolean() });
export const passwordResetSchema = z.object({ password });

// ---------------------------------------------------------------- Settings
export const settingsSchema = z.object({
  storeName: z.string().trim().min(1, 'Store name is required').max(100),
  logoUrl: optionalText(500),
  address: z.string().trim().max(300).default(''),
  phone: z.string().trim().max(50).default(''),
  email: z.union([z.literal(''), z.email('Enter a valid email address').max(200)]).default(''),
  receiptHeader: z.string().trim().max(300).default(''),
  receiptFooter: z.string().trim().max(300).default(''),
  receiptPaperSize: z.enum(PAPER_SIZES),
  receiptShowLogo: z.boolean().default(false),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code (e.g. IDR)'),
  taxEnabled: z.boolean(),
  taxRate: z.number({ error: 'Tax rate must be a number' }).min(0, 'Tax rate cannot be negative').max(100),
  defaultDiscountPercent: z
    .number({ error: 'Discount must be a number' })
    .min(0, 'Discount cannot be negative')
    .max(100, 'Discount cannot exceed 100%'),
  timezone: z
    .string()
    .trim()
    .min(1)
    .refine((tz) => isValidTimeZone(tz), 'Unknown time zone'),
});
export type SettingsInput = z.input<typeof settingsSchema>;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
