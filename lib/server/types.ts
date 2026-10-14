import type { Db } from '../../db/types.ts';

/** Identity derived from a verified Supabase session on the server. Never from request headers or bodies. */
export type SessionUser = { id: string; email: string | null; name: string | null };

/** Injected into route handlers so they can be tested against a real Postgres engine without Next.js. */
export type ApiDeps = {
    user: () => Promise<SessionUser | null>;
    db: () => Db;
    fetch?: typeof fetch;
    now?: () => number;
};
