import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safe-redirect';

export const runtime = 'nodejs';

const TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change'];

/** Token-hash email links (works even when the link is opened in a different browser than the sign-up). */
export async function GET(request: NextRequest) {
    const url = request.nextUrl, tokenHash = url.searchParams.get('token_hash'), type = url.searchParams.get('type') as EmailOtpType | null;
    const next = type === 'recovery' ? '/update-password' : safeNextPath(url.searchParams.get('next'));
    const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, url.origin), 303);
    const supabase = await createSupabaseServerClient();
    if (!supabase) return fail('not_configured');
    if (!tokenHash || !type || !TYPES.includes(type)) return fail('link_expired');
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail(type === 'recovery' ? 'reset_expired' : 'link_expired');
    return NextResponse.redirect(new URL(next === '/' && type !== 'recovery' ? '/?welcome=confirmed' : next, url.origin), 303);
}
