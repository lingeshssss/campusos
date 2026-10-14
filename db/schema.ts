import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, bigint, boolean, jsonb, timestamp, index, check } from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';

// Every row is owned by a Supabase Auth user. Deleting the user in Supabase deletes their CampusOS data.
// RLS is enabled with no policies and migration 0001 revokes anon/authenticated grants, so the public
// Supabase Data API cannot read these tables. The server reaches them through DATABASE_URL (a privileged
// role that bypasses RLS), which is why every query below must filter by the session user's ID.
const owner = () => uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' });
// Millisecond epoch values (Date.now()) exceed int4, so expiry/lock fields are bigint numbers.
const epochMs = (name: string) => bigint(name, { mode: 'number' });

export const studentStates = pgTable('student_states', {
    userId: owner().primaryKey(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('student_states_version_positive', sql`${t.version} >= 1`)]).enableRLS();

export const googleConnections = pgTable('google_connections', {
    userId: owner().primaryKey(),
    googleSub: text('google_sub'),
    email: text('email'),
    refreshToken: text('refresh_token'),
    calendarId: text('calendar_id'),
    calendarStatus: text('calendar_status').notNull().default('none'),
    eventMap: jsonb('event_map').$type<unknown>().notNull().default({}),
    lastSynced: timestamp('last_synced', { withTimezone: true }),
    lastError: text('last_error'),
    lockId: text('lock_id'),
    lockUntil: epochMs('lock_until').notNull().default(0),
}, t => [check('google_connections_calendar_status', sql`${t.calendarStatus} in ('none', 'creating', 'uncertain', 'ready')`)]).enableRLS();

export const googleOAuthAttempts = pgTable('google_oauth_attempts', {
    stateHash: text('state_hash').primaryKey(),
    userId: owner(),
    verifier: text('verifier').notNull(),
    expires: epochMs('expires').notNull(),
}, t => [index('google_oauth_attempts_user_idx').on(t.userId)]).enableRLS();

export const googleSyncPlans = pgTable('google_sync_plans', {
    id: text('id').primaryKey(),
    userId: owner(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    expires: epochMs('expires').notNull(),
    used: boolean('used').notNull().default(false),
}, t => [index('google_sync_plans_user_idx').on(t.userId)]).enableRLS();

// Durable per-user counter for paid AI parsing calls (process memory is not durable on Vercel).
export const aiParseUsage = pgTable('ai_parse_usage', {
    userId: owner().primaryKey(),
    windowStart: epochMs('window_start').notNull(),
    count: integer('count').notNull(),
}).enableRLS();
