import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read Next's env files; load the local one if present (never committed).
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
  out: './drizzle',
  schema: './db/schema.ts',
  dialect: 'postgresql',
  // Schema changes need a session-capable connection (Supabase direct connection or session pooler),
  // not the transaction pooler used by the app at runtime.
  dbCredentials: { url: process.env.DATABASE_MIGRATION_URL ?? '' },
  schemaFilter: ['public'],
  migrations: { table: '__drizzle_migrations', schema: 'drizzle' },
  strict: true,
  verbose: true,
});
