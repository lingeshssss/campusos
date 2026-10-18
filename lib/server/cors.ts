// The mobile apps' bundled web content calls the API cross-origin with a bearer token: the iOS app runs at
// capacitor://localhost, the Android app at https://localhost (Capacitor's defaults). Only those exact
// origins are allowed, without credentials (cookies are never accepted cross-origin), and only for /api
// routes. A page that merely claims one of these origins gains nothing: it still needs the user's token.
export const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost'];

const ALLOW = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Expose-Headers': 'content-disposition, x-campusos-event-count',
    'Access-Control-Max-Age': '600',
};

/** CORS headers for an /api request, or null when the origin is not the native app. */
export function corsHeaders(origin: string | null, path: string): Record<string, string> | null {
    if (!origin || !path.startsWith('/api/') || !NATIVE_APP_ORIGINS.includes(origin)) return null;
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', ...ALLOW };
}
