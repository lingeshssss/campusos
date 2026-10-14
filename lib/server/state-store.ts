import { and, eq } from 'drizzle-orm';
import { studentStates } from '../../db/schema.ts';
import type { Db } from '../../db/types.ts';
import { stateSchema, type State } from '../model.ts';

// Every function takes the owner's ID from the verified session; callers never pass client-supplied IDs.

export async function readStateRow(db: Db, userId: string) {
    const [row] = await db.select().from(studentStates).where(eq(studentStates.userId, userId));
    return row ?? null;
}

export async function loadState(db: Db, userId: string): Promise<{ state: State; version: number; stored: Record<string, unknown> }> {
    const row = await readStateRow(db, userId);
    const stored = (row?.payload ?? {}) as Record<string, unknown>;
    return { state: stateSchema.parse(row ? stored : { profile: null, courses: [] }), version: row?.version ?? 0, stored };
}

/**
 * Optimistic concurrency: writes only if the stored version still equals `expected`
 * (0 means "no row yet"). Returns the new version, or null when someone else saved first.
 */
export async function writeState(db: Db, userId: string, expected: number, state: State): Promise<number | null> {
    const next = expected + 1, values = { payload: state, updatedAt: new Date(), version: next };
    const rows = expected === 0
        ? await db.insert(studentStates).values({ ...values, userId }).onConflictDoNothing().returning({ version: studentStates.version })
        : await db.update(studentStates).set(values).where(and(eq(studentStates.userId, userId), eq(studentStates.version, expected))).returning({ version: studentStates.version });
    return rows.length ? next : null;
}
