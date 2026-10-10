import type { Db } from './prisma';
import { logger } from './logger';

export interface ActivityEntry {
  userId: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  description: string;
}

/**
 * Records an audit-log entry. Pass the transaction client when the action is
 * part of a database transaction so the log commits (or rolls back) with it.
 */
export async function logActivity(db: Db, entry: ActivityEntry): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId == null ? null : String(entry.entityId),
        description: entry.description,
      },
    });
  } catch (err) {
    // Inside a DB transaction the failure must propagate so everything rolls back.
    if ('$transaction' in db) logger.error('Failed to write activity log', err);
    else throw err;
  }
}
