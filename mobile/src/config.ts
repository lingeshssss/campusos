// Public build-time configuration for the iOS app. Secrets never belong here.
function origin(name: string, value: string | undefined) {
    let url: URL;
    try {
        url = new URL(value ?? '');
    } catch {
        throw Error(`${name} is missing or not a URL. See mobile/.env.example.`);
    }
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw Error(`${name} must use https://`);
    return url.origin;
}

const env = import.meta.env;
export const config = {
    apiOrigin: origin('VITE_API_ORIGIN', env.VITE_API_ORIGIN),
    supabaseUrl: origin('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL),
    supabaseKey: String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''),
    apple: env.VITE_ENABLE_APPLE_SIGNIN === 'true',
    google: env.VITE_ENABLE_GOOGLE_SIGNIN === 'true',
    /** Custom-scheme callback for OAuth in the in-app browser (PKCE: the code is useless outside this app). */
    oauthCallback: 'campusos://auth/callback',
    /** Universal link for email confirmation / password reset links. */
    emailCallback: '',
};
config.emailCallback = `${config.apiOrigin}/auth/mobile-callback`;
if (!config.supabaseKey || /^sb_secret_/.test(config.supabaseKey)) throw Error('VITE_SUPABASE_PUBLISHABLE_KEY must be the publishable (public) key.');
if (config.google && !config.apple) throw Error('Google sign-in requires Sign in with Apple in the iOS app (App Store guideline 4.8). Set VITE_ENABLE_APPLE_SIGNIN=true.');
