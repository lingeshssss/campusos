import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema.ts';

// Shared by the postgres-js production client and the PGlite test client.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
