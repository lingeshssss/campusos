import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabasePublicConfig } from './lib/supabase/config';

// Pages reachable without a session. API routes enforce authentication themselves and answer 401 JSON.
const PUBLIC_PAGES = ['/login', '/signup', '/forgot-password'];
const isPublic = (path: string) => PUBLIC_PAGES.includes(path) || path.startsWith('/auth/') || path.startsWith('/api/');

/** Refreshes the Supabase session cookie on every request and sends signed-out visitors to /login. */
export async function proxy(request: NextRequest) {
    const config = supabasePublicConfig();
    if (!config) return NextResponse.next({ request });
    let response = NextResponse.next({ request });
    const supabase = createServerClient(config.url, config.key, {
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll(list, headers) {
                for (const { name, value } of list) request.cookies.set(name, value);
                response = NextResponse.next({ request });
                for (const { name, value, options } of list) response.cookies.set(name, value, options);
                for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
            },
        },
    });
    let signedIn = false;
    try {
        const { data } = await supabase.auth.getClaims();
        signedIn = !!data?.claims?.sub && data.claims.role === 'authenticated';
    } catch {
        signedIn = false;
    }
    const path = request.nextUrl.pathname;
    if (!signedIn && !isPublic(path)) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.search = '';
        if (path !== '/') url.searchParams.set('next', path + request.nextUrl.search);
        return withCookies(NextResponse.redirect(url), response);
    }
    if (signedIn && (path === '/login' || path === '/signup')) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        url.search = '';
        return withCookies(NextResponse.redirect(url), response);
    }
    return response;
}

function withCookies(target: NextResponse, source: NextResponse) {
    for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
    target.headers.set('Cache-Control', 'private, no-store');
    return target;
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon\\.svg|pdfjs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs|bcmap|pfb|ttf)$).*)'],
};
