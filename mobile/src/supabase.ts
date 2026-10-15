import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { App } from '@capacitor/app';
import { config } from './config';
import { keychain } from './secure';

// PKCE + Keychain-backed session. Tokens refresh only while the app is in the foreground.
export const supabase: SupabaseClient = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { storage: keychain, flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
});

/** Current access token for API calls, refreshed when needed. Null when signed out. */
export async function accessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}
