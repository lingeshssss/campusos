import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sameOrigin } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    const supabase = await createSupabaseServerClient();
    if (supabase) await supabase.auth.signOut({ scope: 'local' });
    const message = request.nextUrl.searchParams.get('reason') === 'account_deleted' ? 'account_deleted' : 'signed_out';
    return NextResponse.redirect(new URL(`/login?message=${message}`, request.nextUrl.origin), 303);
}
