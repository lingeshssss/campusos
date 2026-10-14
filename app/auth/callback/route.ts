import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safe-redirect';

export const runtime = 'nodejs';

/**
 * PKCE return point for Supabase Auth: Google sign-in, email confirmation and password-reset links.
 * (Not the Google Calendar callback, which is /api/google/oauth/callback.)
 */
export async function GET(request: NextRequest) {
    const url = request.nextUrl, next = safeNextPath(url.searchParams.get('next'));
    const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, url.origin), 303);
    if (url.searchParams.get('error')) return fail(url.searchParams.get('error_code') === 'otp_expired' ? 'link_expired' : 'oauth_failed');
    const code = url.searchParams.get('code');
    const supabase = await createSupabaseServerClient();
    if (!supabase) return fail('not_configured');
    if (!code) return fail('link_expired');
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(next === '/update-password' ? 'reset_expired' : 'link_expired');
    return NextResponse.redirect(new URL(next, url.origin), 303);
}
