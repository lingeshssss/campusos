// Exercises the production driver path (postgres.js + drizzle-orm/postgres-js, prepare: false as required
// by Supabase's transaction pooler) over the Postgres wire protocol, against the migrated schema.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import * as schema from '../db/schema.ts';
import { testDb, profile, course } from './helpers/db.mjs';
import { loadState, writeState } from '../lib/server/state-store.ts';
import { stateSchema } from '../lib/model.ts';
import { consumeAiQuota } from '../lib/server/ai-quota.ts';
import { lock, unlock } from '../lib/google-server.ts';

const ctx = await testDb();
const server = new PGLiteSocketServer({ db: ctx.client, port: 0, host: '127.0.0.1' });
await server.start();
const [host, port] = server.getServerConn().split(':');
const sql = postgres({ host, port: Number(port), user: 'postgres', password: 'postgres', database: 'postgres', prepare: false, max: 1, idle_timeout: 5 });
const db = drizzle(sql, { schema });
after(async () => { await sql.end({ timeout: 1 }); await server.stop(); });

test('postgres.js stores state as a jsonb object (not a JSON string) and round-trips it', async () => {
    const u = await ctx.addUser();
    const state = stateSchema.parse({ profile, courses: [course] });
    assert.equal(await writeState(db, u.id, 0, state), 1);
    const kind = await ctx.client.query('select jsonb_typeof(payload) as t, payload->\'profile\'->>\'university\' as uni from student_states where user_id = $1', [u.id]);
    assert.equal(kind.rows[0].t, 'object');
    assert.equal(kind.rows[0].uni, 'Rutgers');
    const loaded = await loadState(db, u.id);
    assert.equal(loaded.version, 1);
    assert.deepEqual(loaded.state, state);
    assert.equal(await writeState(db, u.id, 0, state), null, 'stale version rejected');
    assert.equal(await writeState(db, u.id, 1, state), 2);
});

test('postgres.js handles bigint epoch columns, upserts and conditional updates', async () => {
    const u = await ctx.addUser();
    const now = Date.now();
    assert.equal(await consumeAiQuota(db, u.id, now), true);
    const row = await ctx.client.query('select window_start::text as w, count from ai_parse_usage where user_id = $1', [u.id]);
    assert.equal(row.rows[0].w, String(now));
    const id = await lock(db, u.id);
    await assert.rejects(lock(db, u.id), /Another calendar action/);
    await unlock(db, u.id, id);
    const lockRow = await db.query.googleConnections.findFirst({ where: (t, { eq }) => eq(t.userId, u.id) });
    assert.equal(typeof lockRow.lockUntil, 'number');
    assert.deepEqual(lockRow.eventMap, {});
});
