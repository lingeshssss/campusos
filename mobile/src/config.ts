// Public build-time configuration for the iOS app. Secrets never belong here.
// Problems are collected instead of thrown: a throw here leaves a blank white screen on the iPhone, so
// main.tsx shows them on screen instead (and the production build refuses to start without them).
const problems: string[] = [];

function origin(name: string, value: string | undefined) {
    let url: URL;
    try {
        url = new URL(value ?? '');
    } catch {
        problems.push(`${name} is missing or not a URL.`);
        return 'https://invalid.localhost';
    }
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) problems.push(`${name} must use https://`);
    return url.origin;
}

const env = import.meta.env;
const apiOrigin = origin('VITE_API_ORIGIN', env.VITE_API_ORIGIN);
export const config = {
    apiOrigin,
    supabaseUrl: origin('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL),
    supabaseKey: String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''),
    apple: env.VITE_ENABLE_APPLE_SIGNIN === 'true',
    google: env.VITE_ENABLE_GOOGLE_SIGNIN === 'true',
    /** Custom-scheme callback for OAuth in the in-app browser (PKCE: the code is useless outside this app). */
    oauthCallback: 'campusos://auth/callback',
    /** Universal link for email confirmation / password reset links. */
    emailCallback: `${apiOrigin}/auth/mobile-callback`,
};
if (!config.supabaseKey || /^sb_secret_/.test(config.supabaseKey)) problems.push('VITE_SUPABASE_PUBLISHABLE_KEY must be the publishable (public) key.');
if (config.google && !config.apple) problems.push('Google sign-in requires Sign in with Apple in the iOS app (App Store guideline 4.8). Set VITE_ENABLE_APPLE_SIGNIN=true.');

/** Empty when the build is configured correctly. */
export const configProblems: readonly string[] = problems;
