import type { SessionUser } from './types.ts';

/**
 * Parses an Authorization header. `undefined` = header absent (use the cookie session);
 * `null` = header present but malformed (reject; never fall back to cookies).
 */
export function bearerToken(header: string | null | undefined): string | null | undefined {
    if (header === null || header === undefined) return undefined;
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header.trim());
    return match ? match[1] : null;
}

/** Converts verified Supabase JWT claims into the app's user. Returns null for anything but a signed-in user. */
export function userFromClaims(claims: Record<string, unknown> | null | undefined): SessionUser | null {
    if (!claims || typeof claims.sub !== 'string' || claims.role !== 'authenticated' || claims.is_anonymous === true) return null;
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null;
    const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
    const app = (claims.app_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null;
    const providers = Array.isArray(app.providers) ? app.providers.filter((p): p is string => typeof p === 'string') : typeof app.provider === 'string' ? [app.provider] : [];
    return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null, name, providers };
}
