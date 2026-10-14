// Only same-site relative paths may be used as post-login destinations. Anything else falls back to "/".
const AUTH_PATHS = new Set(['/login', '/signup', '/auth/callback', '/auth/confirm', '/auth/signout', '/forgot-password']);

export function safeNextPath(value: string | null | undefined, fallback = '/'): string {
    if (typeof value !== 'string' || value.length > 2000) return fallback;
    // Reject protocol-relative ("//evil"), backslash tricks ("/\\evil") and control characters.
    if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
    let url: URL;
    try {
        url = new URL(value, 'https://campusos.invalid');
    } catch {
        return fallback;
    }
    if (url.origin !== 'https://campusos.invalid') return fallback;
    if (AUTH_PATHS.has(url.pathname) || url.pathname.startsWith('/api/')) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
}
