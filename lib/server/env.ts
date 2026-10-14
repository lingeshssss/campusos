// Server-only configuration. Read lazily so missing optional values never break `next build`.
// Nothing here may be imported by a client component.

const blank = (v: string | undefined) => (v ?? '').trim();

/**
 * Validated canonical origin of this deployment, e.g. https://campusos.example.com.
 * Must be an origin only (no path/query). HTTPS is required except for localhost development.
 */
export function appOrigin(env: Record<string, string | undefined> = process.env): string | null {
    const raw = blank(env.APP_ORIGIN);
    if (!raw) return null;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null;
    if (raw.replace(/\/$/, '') !== url.origin) return null;
    return url.origin;
}

/** Decodes TOKEN_ENCRYPTION_KEY (base64 of at least 32 random bytes). */
export function tokenKey(env: Record<string, string | undefined> = process.env): string | null {
    const raw = blank(env.TOKEN_ENCRYPTION_KEY);
    if (!raw || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) return null;
    try {
        const bytes = Buffer.from(raw.replaceAll('-', '+').replaceAll('_', '/'), 'base64');
        return bytes.length >= 32 ? raw : null;
    } catch {
        return null;
    }
}

export type GoogleConfig = {
    id: string;
    secret: string;
    key: string;
    origin: string;
    redirectUri: string;
    ready: true;
} | {
    ready: false;
    missing: string[];
    redirectUri: string | null;
};

/** Calendar OAuth is enabled only when every server value is present and valid. */
export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig {
    const id = blank(env.GOOGLE_CLIENT_ID), secret = blank(env.GOOGLE_CLIENT_SECRET), key = tokenKey(env), origin = appOrigin(env);
    const missing = [
        ...(id.endsWith('.apps.googleusercontent.com') ? [] : ['GOOGLE_CLIENT_ID']),
        ...(secret ? [] : ['GOOGLE_CLIENT_SECRET']),
        ...(key ? [] : ['TOKEN_ENCRYPTION_KEY']),
        ...(origin ? [] : ['APP_ORIGIN']),
    ];
    const redirectUri = origin ? origin + '/api/google/oauth/callback' : null;
    if (missing.length || !key || !origin || !redirectUri) return { ready: false, missing, redirectUri };
    return { id, secret, key, origin, redirectUri, ready: true };
}

/** Secure cookies everywhere except plain-http localhost development. */
export function secureCookies(origin: string | null) {
    return !origin || origin.startsWith('https://');
}

export function openAiConfig(env: Record<string, string | undefined> = process.env) {
    const key = blank(env.OPENAI_API_KEY);
    return key ? { key, model: blank(env.OPENAI_MODEL) || 'gpt-4.1-mini' } : null;
}
