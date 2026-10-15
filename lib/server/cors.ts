// The iOS app's bundled web content runs at capacitor://localhost and calls the API cross-origin with a
// bearer token. Only that exact origin is allowed, without credentials (cookies are never accepted
// cross-origin), and only for /api routes.
export const NATIVE_APP_ORIGINS = ['capacitor://localhost'];

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
