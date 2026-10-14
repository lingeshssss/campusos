// Real Postgres (PGlite, in-process WASM) with a minimal stand-in for Supabase's auth schema and
// Data API roles, migrated with the same drizzle/ migration files that `pnpm db:migrate` applies.
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../db/schema.ts';

export async function testDb() {
    const client = new PGlite();
    await client.exec(`
        create schema auth;
        create table auth.users (id uuid primary key, email text);
        create role anon nologin;
        create role authenticated nologin;
        grant usage on schema public to anon, authenticated;
        -- Supabase grants Data API roles access to new public tables by default; reproduce that.
        alter default privileges in schema public grant all on tables to anon, authenticated;
    `);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)), migrationsSchema: 'drizzle', migrationsTable: '__drizzle_migrations' });
    async function addUser(email = `${randomUUID()}@example.edu`) {
        const id = randomUUID();
        await client.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
        return { id, email, name: null };
    }
    return { client, db, addUser };
}

export const ORIGIN = 'https://campusos.test';

export function request(path, { method = 'GET', body, origin = ORIGIN, headers = {}, host = ORIGIN } = {}) {
    const h = { ...headers };
    if (origin) h.origin = origin;
    if (body !== undefined && typeof body !== 'string' && !(body instanceof FormData)) h['content-type'] = 'application/json';
    return new Request(host + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' || body instanceof FormData ? body : JSON.stringify(body) });
}

export const deps = (db, user, extra = {}) => ({ db: () => db, user: async () => user, ...extra });

export const profile = { name: 'Test', university: 'Rutgers', domain: 'rutgers.edu', majors: 'CS', minors: '', graduation: 2030, semester: 'Fall 2026', start: '2026-09-01', end: '2026-12-20', timezone: 'America/New_York' };
export const course = { id: 'd973e7ec-97ac-41cf-9efb-26adff779560', code: 'CS111', title: 'Intro', section: '01', days: [1, 3], start: '10:00', end: '11:20', building: 'Hall', room: '12', professor: 'Professor', travel: 15, color: 'mint' };
