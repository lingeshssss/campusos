'use client';
import { createBrowserClient } from '@supabase/ssr';
import { supabasePublicConfig } from './config';

export function createSupabaseBrowserClient() {
    const config = supabasePublicConfig();
    if (!config) throw new Error('Sign-in is not configured for this deployment yet.');
    return createBrowserClient(config.url, config.key);
}

/**
 * Asks the hosted Supabase project (not an env flag) whether an OAuth provider is switched on, so a disabled
 * provider shows a message here instead of Supabase's raw "provider is not enabled" page. Returns null when
 * the check itself fails; callers should then proceed and let the normal callback error handling apply.
 */
export async function isProviderEnabled(provider: 'google' | 'apple'): Promise<boolean | null> {
    const config = supabasePublicConfig();
    if (!config) return false;
    try {
        const res = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.key }, cache: 'no-store' });
        if (!res.ok) return null;
        const settings = (await res.json()) as { external?: Record<string, boolean> };
        return settings.external?.[provider] === true;
    } catch {
        return null;
    }
}
