import 'server-only';
import { getDb } from '@/db';
import { getSessionUser } from '@/lib/supabase/server';
import type { ApiDeps } from './types';

/** Production dependencies: identity from the verified Supabase session, data from Postgres. */
export const deps: ApiDeps = { user: getSessionUser, db: getDb };
