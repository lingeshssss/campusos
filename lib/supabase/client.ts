'use client';
import { createBrowserClient } from '@supabase/ssr';
import { supabasePublicConfig } from './config';

export function createSupabaseBrowserClient() {
    const config = supabasePublicConfig();
    if (!config) throw new Error('Sign-in is not configured for this deployment yet.');
    return createBrowserClient(config.url, config.key);
}
