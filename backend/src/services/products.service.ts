import type { Prisma, Product, Role } from '@prisma/client';
import {
  type ProductData,
  type ProductImportRow,
  type ProductUpdateData,
  type StockStatus,
  formatRupiah,
  getStockStatus,
  productSchema,
  toCsv,
} from '@pos/shared';
import { ZodError } from 'zod';
import { logActivity } from '../lib/activity';
import { badRequest, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import type { AuthUser } from '../middleware/auth';
import { type Pagination, paginate, paginated } from '../validators/common';

type ProductWithCategory = Product & { category: { id: number; name: string } | null };

const categorySelect = { select: { id: true, name: true } } as const;

/** Adds the derived stock status and hides cost data from cashiers. */
export function serializeProduct(p: ProductWithCategory, role: Role) {
  const { purchasePrice, ...rest } = p;
  return {
    ...rest,
    ...(role === 'ADMIN' ? { purchasePrice } : {}),
    stockStatus: getStockStatus(p.stock, p.minStock),
  };
}

export function stockStatusWhere(status: StockStatus): Prisma.ProductWhereInput {
  switch (status) {
    case 'OUT_OF_STOCK':
      return { stock: { lte: 0 } };
    case 'LOW_STOCK':
      return { stock: { gt: 0, lte: prisma.product.fields.minStock } };
    case 'IN_STOCK':
      return { AND: [{ stock: { gt: 0 } }, { stock: { gt: prisma.product.fields.minStock } }] };
  }
}

export interface ProductListQuery extends Pagination {
  search?: string;
  categoryId?: number;
  stockStatus?: StockStatus;
  isActive?: boolean;
  sort: 'name' | 'sellingPrice' | 'stock' | 'createdAt' | 'sku';
  order: 'asc' | 'desc';
}

export function productWhere(q: Pick<ProductListQuery, 'search' | 'categoryId' | 'stockStatus' | 'isActive'>) {
  const and: Prisma.ProductWhereInput[] = [];
  if (q.isActive !== undefined) and.push({ isActive: q.isActive });
  if (q.categoryId) and.push({ categoryId: q.categoryId });
  if (q.stockStatus) and.push(stockStatusWhere(q.stockStatus));
  if (q.search) {
    and.push({
      OR: [
        { name: { contains: q.search, mode: 'insensitive' } },
        { sku: { contains: q.search, mode: 'insensitive' } },
        { barcode: q.search },
      ],
    });
  }
  return { AND: and } satisfies Prisma.ProductWhereInput;
}

export async function listProducts(q: ProductListQuery, role: Role) {
  const where = productWhere(q);
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: categorySelect },
      orderBy: [{ [q.sort]: q.order }, { id: 'asc' }],
      ...paginate(q),
    }),
    prisma.product.count({ where }),
  ]);
  return paginated(
    rows.map((p) => serializeProduct(p, role)),
    total,
    q,
  );
}

export async function getProduct(id: number, role: Role) {
  const product = await prisma.product.findUnique({ where: { id }, include: { category: categorySelect } });
  if (!product) throw notFound('Product not found.');
  return serializeProduct(product, role);
}

/** Exact barcode or SKU match — used by the barcode scanner on the POS screen. */
export async function lookupProduct(code: string, role: Role) {
  const value = code.trim();
  if (!value) throw badRequest('Enter a barcode or SKU.');
  const product =
    (await prisma.product.findUnique({ where: { barcode: value }, include: { category: categorySelect } })) ??
    (await prisma.product.findFirst({
      where: { sku: { equals: value, mode: 'insensitive' } },
      include: { category: categorySelect },
    }));
  if (!product) throw notFound(`No product found for code "${value}".`);
  if (!product.isActive) throw badRequest(`"${product.name}" is inactive and cannot be sold.`, 'PRODUCT_INACTIVE');
  return serializeProduct(product, role);
}

async function assertCategory(tx: Prisma.TransactionClient, categoryId: number | null) {
  if (categoryId === null) return;
  const exists = await tx.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!exists) throw badRequest('The selected category does not exist.', 'BAD_CATEGORY');
}

export async function createProduct(data: ProductData, actor: AuthUser) {
  return prisma.$transaction(async (tx) => {
    await assertCategory(tx, data.categoryId);
    const product = await tx.product.create({ data, include: { category: categorySelect } });
    if (product.stock > 0) {
      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          type: 'INITIAL',
          quantityChange: product.stock,
          previousStock: 0,
          newStock: product.stock,
          reason: 'Opening stock',
          userId: actor.id,
        },
      });
    }
    await logActivity(tx, {
      userId: actor.id,
      action: 'PRODUCT_CREATED',
      entity: 'Product',
      entityId: product.id,
      description: `${actor.name} created product "${product.name}"`,
    });
    return serializeProduct(product, actor.role);
  });
}

export async function updateProduct(id: number, data: ProductUpdateData, actor: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({ where: { id } });
    if (!existing) throw notFound('Product not found.');
    await assertCategory(tx, data.categoryId);
    const product = await tx.product.update({ where: { id }, data, include: { category: categorySelect } });

    const changes: string[] = [];
    if (existing.sellingPrice !== product.sellingPrice) {
      changes.push(`selling price ${formatRupiah(existing.sellingPrice)} → ${formatRupiah(product.sellingPrice)}`);
    }
    if (existing.purchasePrice !== product.purchasePrice) {
      changes.push(`purchase price ${formatRupiah(existing.purchasePrice)} → ${formatRupiah(product.purchasePrice)}`);
    }
    if (existing.isActive !== product.isActive) changes.push(product.isActive ? 'activated' : 'deactivated');
    if (existing.name !== product.name) changes.push(`renamed from "${existing.name}"`);
    const hasPriceChange = existing.sellingPrice !== product.sellingPrice || existing.purchasePrice !== product.purchasePrice;

    await logActivity(tx, {
      userId: actor.id,
      action: hasPriceChange ? 'PRODUCT_PRICE_CHANGED' : 'PRODUCT_UPDATED',
      entity: 'Product',
      entityId: id,
      description: `${actor.name} updated "${product.name}"${changes.length ? ` (${changes.join(', ')})` : ''}`,
    });
    return serializeProduct(product, actor.role);
  });
}

/**
 * Products are never hard-deleted: they may be referenced by transactions and
 * inventory history. "Deleting" archives the product (inactive) instead.
 */
export async function archiveProduct(id: number, actor: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({ where: { id } });
    if (!existing) throw notFound('Product not found.');
    const product = await tx.product.update({
      where: { id },
      data: { isActive: false },
      include: { category: categorySelect },
    });
    await logActivity(tx, {
      userId: actor.id,
      action: 'PRODUCT_ARCHIVED',
      entity: 'Product',
      entityId: id,
      description: `${actor.name} archived product "${product.name}"`,
    });
    return serializeProduct(product, actor.role);
  });
}

// ------------------------------------------------------------------ CSV

export const PRODUCT_CSV_HEADERS = [
  'sku',
  'barcode',
  'name',
  'description',
  'category',
  'purchasePrice',
  'sellingPrice',
  'stock',
  'minStock',
  'unit',
  'isActive',
];

export async function exportProductsCsv(q: Pick<ProductListQuery, 'search' | 'categoryId' | 'stockStatus' | 'isActive'>) {
  const rows = await prisma.product.findMany({
    where: productWhere(q),
    include: { category: categorySelect },
    orderBy: { name: 'asc' },
  });
  return toCsv(
    PRODUCT_CSV_HEADERS,
    rows.map((p) => [
      p.sku,
      p.barcode,
      p.name,
      p.description,
      p.category?.name,
      p.purchasePrice,
      p.sellingPrice,
      p.stock,
      p.minStock,
      p.unit,
      p.isActive ? 'true' : 'false',
    ]),
  );
}

function toInt(value: string | number | undefined, fallback?: number): number | undefined {
  if (value === undefined || value === '') return fallback;
  if (typeof value === 'number') return value;
  // Accept "10.000" / "10,000" / "Rp10.000" style numbers from spreadsheets
  const cleaned = value.replace(/rp/i, '').replace(/[.,\s](?=\d{3}(\D|$))/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function toBool(value: string | boolean | undefined): boolean {
  if (value === undefined || value === '') return true;
  if (typeof value === 'boolean') return value;
  return !['false', '0', 'no', 'inactive', 'n'].includes(value.trim().toLowerCase());
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

/**
 * Imports products keyed by SKU (existing SKUs are updated). All rows are
 * validated first; nothing is written unless every row is valid.
 */
export async function importProducts(rows: ProductImportRow[], actor: AuthUser): Promise<ImportResult> {
  const errors: ImportResult['errors'] = [];
  const parsed: { row: number; data: ProductData; category: string | null; hasStock: boolean }[] = [];
  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();

  rows.forEach((raw, index) => {
    const rowNumber = index + 2; // +1 for header, +1 for 1-based numbering
    try {
      const data = productSchema.parse({
        sku: raw.sku,
        barcode: raw.barcode,
        name: raw.name,
        description: raw.description,
        categoryId: null,
        purchasePrice: toInt(raw.purchasePrice),
        sellingPrice: toInt(raw.sellingPrice),
        stock: toInt(raw.stock, 0),
        minStock: toInt(raw.minStock, 0),
        unit: raw.unit?.trim() || 'pcs',
        isActive: toBool(raw.isActive),
      });
      const skuKey = data.sku.toLowerCase();
      if (seenSku.has(skuKey)) throw new Error(`Duplicate SKU "${data.sku}" in file`);
      seenSku.add(skuKey);
      if (data.barcode) {
        if (seenBarcode.has(data.barcode)) throw new Error(`Duplicate barcode "${data.barcode}" in file`);
        seenBarcode.add(data.barcode);
      }
      parsed.push({
        row: rowNumber,
        data,
        category: raw.category?.trim() || null,
        hasStock: raw.stock !== undefined && raw.stock !== '',
      });
    } catch (err) {
      const message = err instanceof ZodError ? `${err.issues[0].path.join('.')}: ${err.issues[0].message}` : (err as Error).message;
      errors.push({ row: rowNumber, message });
    }
  });

  if (errors.length > 0) return { created: 0, updated: 0, errors: errors.slice(0, 100) };

  return prisma.$transaction(
    async (tx) => {
      // Barcodes must not collide with *other* products already in the database
      const barcodes = parsed.map((p) => p.data.barcode).filter((b): b is string => !!b);
      const barcodeOwners = await tx.product.findMany({
        where: { barcode: { in: barcodes } },
        select: { sku: true, barcode: true },
      });
      const ownerByBarcode = new Map(barcodeOwners.map((o) => [o.barcode, o.sku.toLowerCase()]));
      for (const p of parsed) {
        const owner = p.data.barcode ? ownerByBarcode.get(p.data.barcode) : undefined;
        if (owner && owner !== p.data.sku.toLowerCase()) {
          errors.push({ row: p.row, message: `Barcode "${p.data.barcode}" already belongs to SKU ${owner.toUpperCase()}` });
        }
      }
      if (errors.length > 0) return { created: 0, updated: 0, errors };

      // Resolve (or create) categories by name
      const categoryIds = new Map<string, number>();
      const names = [...new Set(parsed.map((p) => p.category).filter((c): c is string => !!c))];
      for (const name of names) {
        const existing = await tx.category.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
        const category = existing ?? (await tx.category.create({ data: { name } }));
        categoryIds.set(name.toLowerCase(), category.id);
      }

      let created = 0;
      let updated = 0;
      for (const p of parsed) {
        const categoryId = p.category ? (categoryIds.get(p.category.toLowerCase()) ?? null) : null;
        const existing = await tx.product.findFirst({
          where: { sku: { equals: p.data.sku, mode: 'insensitive' } },
        });
        if (!existing) {
          const product = await tx.product.create({ data: { ...p.data, categoryId } });
          if (product.stock > 0) {
            await tx.inventoryMovement.create({
              data: {
                productId: product.id,
                type: 'IMPORT',
                quantityChange: product.stock,
                previousStock: 0,
                newStock: product.stock,
                reason: 'CSV import',
                userId: actor.id,
              },
            });
          }
          created++;
          continue;
        }
        const { stock, ...fields } = p.data;
        await tx.product.update({ where: { id: existing.id }, data: { ...fields, categoryId } });
        if (p.hasStock && stock !== existing.stock) {
          await tx.product.update({ where: { id: existing.id }, data: { stock } });
          await tx.inventoryMovement.create({
            data: {
              productId: existing.id,
              type: 'IMPORT',
              quantityChange: stock - existing.stock,
              previousStock: existing.stock,
              newStock: stock,
              reason: 'CSV import',
              userId: actor.id,
            },
          });
        }
        updated++;
      }

      await logActivity(tx, {
        userId: actor.id,
        action: 'PRODUCTS_IMPORTED',
        entity: 'Product',
        description: `${actor.name} imported products from CSV (${created} created, ${updated} updated)`,
      });
      return { created, updated, errors: [] };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
