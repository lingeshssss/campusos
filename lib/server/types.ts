import type { Db } from '../../db/types.ts';

/** Identity from a verified Supabase access token (session cookie or Authorization: Bearer). Never from other headers or bodies. */
export type SessionUser = { id: string; email: string | null; name: string | null; providers?: string[] };

/** Injected into route handlers so they can be tested against a real Postgres engine without Next.js. */
export type ApiDeps = {
    user: () => Promise<SessionUser | null>;
    db: () => Db;
    fetch?: typeof fetch;
    now?: () => number;
};
