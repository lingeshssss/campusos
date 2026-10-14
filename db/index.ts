import 'server-only';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import type { Db } from './types';

export type { Db } from './types';

// One connection per server instance, reused across requests (Supabase's serverless guidance).
// DATABASE_URL should be Supabase's transaction pooler (port 6543), which does not support
// prepared statements, hence `prepare: false`.
const globalForDb = globalThis as unknown as { campusosDb?: Db };

export class DatabaseUnavailableError extends Error {}

export function getDb(): Db {
    if (globalForDb.campusosDb) return globalForDb.campusosDb;
    const url = process.env.DATABASE_URL;
    if (!url) throw new DatabaseUnavailableError('DATABASE_URL is not configured.');
    const client = postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });
    globalForDb.campusosDb = drizzle(client, { schema }) as unknown as Db;
    return globalForDb.campusosDb;
}
