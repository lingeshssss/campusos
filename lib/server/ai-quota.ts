import { sql } from 'drizzle-orm';
import { aiParseUsage } from '../../db/schema.ts';
import type { Db } from '../../db/types.ts';

// Paid AI parsing is capped per user per rolling hour window. Stored in Postgres because
// serverless instances do not share memory and may be recycled at any time.
export const AI_CALLS_PER_HOUR = 20;
const WINDOW_MS = 3_600_000;

/** Atomically counts one AI call. Returns false when the user is over the limit (the call must not be made). */
export async function consumeAiQuota(db: Db, userId: string, now: number, limit = AI_CALLS_PER_HOUR): Promise<boolean> {
    const expired = sql`${aiParseUsage.windowStart} <= ${now - WINDOW_MS}`;
    const [row] = await db.insert(aiParseUsage).values({ userId, windowStart: now, count: 1 }).onConflictDoUpdate({
        target: aiParseUsage.userId,
        set: {
            windowStart: sql`case when ${expired} then ${now} else ${aiParseUsage.windowStart} end`,
            count: sql`case when ${expired} then 1 else ${aiParseUsage.count} + 1 end`,
        },
    }).returning({ count: aiParseUsage.count });
    return !!row && row.count <= limit;
}
