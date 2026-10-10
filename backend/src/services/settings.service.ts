import type { StoreSetting } from '@prisma/client';
import { settingsSchema } from '@pos/shared';
import type { z } from 'zod';
import { logActivity } from '../lib/activity';
import { type Db, prisma } from '../lib/prisma';
import type { AuthUser } from '../middleware/auth';

/** Returns the single settings row, creating it with defaults on first use. */
export async function getSettings(db: Db = prisma): Promise<StoreSetting> {
  const existing = await db.storeSetting.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  // INSERT ... ON CONFLICT DO NOTHING — safe when concurrent requests race to create it.
  await db.storeSetting.createMany({ data: [{ id: 1 }], skipDuplicates: true });
  return db.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
}

const FIELD_NAMES: Record<string, string> = {
  storeName: 'store name',
  logoUrl: 'logo',
  address: 'address',
  phone: 'phone',
  email: 'email',
  receiptHeader: 'receipt header',
  receiptFooter: 'receipt footer',
  receiptPaperSize: 'paper size',
  receiptShowLogo: 'receipt logo',
  currency: 'currency',
  taxEnabled: 'tax',
  taxRate: 'tax rate',
  defaultDiscountPercent: 'default discount',
  timezone: 'time zone',
};

export async function updateSettings(data: z.output<typeof settingsSchema>, user: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const before = await getSettings(tx);
    const updated = await tx.storeSetting.update({ where: { id: 1 }, data });
    const changed = (Object.keys(data) as (keyof typeof data)[])
      .filter((key) => before[key] !== updated[key])
      .map((key) => FIELD_NAMES[key] ?? key);
    if (changed.length > 0) {
      await logActivity(tx, {
        userId: user.id,
        action: 'SETTINGS_UPDATED',
        entity: 'StoreSetting',
        entityId: 1,
        description: `${user.name} changed store settings (${changed.join(', ')})`,
      });
    }
    return updated;
  });
}
