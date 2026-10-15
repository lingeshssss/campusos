import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { supabasePublicConfig } from './config';
import { bearerToken, userFromClaims } from '../server/identity';
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
 * (via Supabase's signing keys) instead of trusting its contents. The website sends the token in session
 * cookies; the iOS app sends it as `Authorization: Bearer`. When that header is present it is the only
 * credential considered. No other request headers are consulted.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
    const config = supabasePublicConfig();
    if (!config) return null;
    try {
        const token = bearerToken((await headers()).get('authorization'));
        if (token === null) return null;
        if (token !== undefined) {
            const client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
            const { data, error } = await client.auth.getClaims(token);
            return error ? null : userFromClaims(data?.claims as Record<string, unknown> | undefined);
        }
        const supabase = await createSupabaseServerClient();
        if (!supabase) return null;
        const { data, error } = await supabase.auth.getClaims();
        return error ? null : userFromClaims(data?.claims as Record<string, unknown> | undefined);
    } catch {
        return null;
    }
});
