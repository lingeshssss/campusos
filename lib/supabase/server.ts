import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabasePublicConfig } from './config';
import type { SessionUser } from '../server/types';

export async function createSupabaseServerClient() {
    const config = supabasePublicConfig();
    if (!config) return null;
    const store = await cookies();
    return createServerClient(config.url, config.key, {
        cookies: {
            getAll: () => store.getAll(),
            setAll(list) {
                try {
                    for (const { name, value, options } of list) store.set(name, value, options);
                } catch {
                    // Server Components cannot set cookies; proxy.ts refreshes the session instead.
                }
            },
        },
    });
}

/**
 * The only source of user identity on the server. getClaims() verifies the access token's signature
 * (via Supabase's signing keys) instead of trusting cookie contents. Request headers are never consulted.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.auth.getClaims();
        const claims = data?.claims;
        if (error || !claims?.sub || claims.role !== 'authenticated' || claims.is_anonymous) return null;
        const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
        const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null;
        return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null, name };
    } catch {
        return null;
    }
});
