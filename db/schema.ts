import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const studentStates = sqliteTable('student_states', {
    userId: text('user_id').primaryKey(), payload: text('payload').notNull(), version: integer('version').notNull().default(1), updatedAt: text('updated_at').notNull()
});
export const googleConnections = sqliteTable('google_connections', {
    userId: text('user_id').primaryKey(), googleSub: text('google_sub'), email: text('email'), refreshToken: text('refresh_token'), calendarId: text('calendar_id'), calendarStatus: text('calendar_status').notNull().default('none'), eventMap: text('event_map').notNull().default('{}'), lastSynced: text('last_synced'), lastError: text('last_error'), lockId: text('lock_id'), lockUntil: integer('lock_until').notNull().default(0)
});
export const googleOAuthAttempts = sqliteTable('google_oauth_attempts', {
    stateHash: text('state_hash').primaryKey(), userId: text('user_id').notNull(), verifier: text('verifier').notNull(), expires: integer('expires').notNull()
});
export const googleSyncPlans = sqliteTable('google_sync_plans', {
    id: text('id').primaryKey(), userId: text('user_id').notNull(), payload: text('payload').notNull(), expires: integer('expires').notNull(), used: integer('used').notNull().default(0)
});
