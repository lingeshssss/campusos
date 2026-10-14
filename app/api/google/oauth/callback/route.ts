import { getChatGPTUser } from '../../../../chatgpt-auth';
import { APP_ORIGIN, config, REDIRECT_URI, GOOGLE_SCOPE, connection, lock, unlock } from '../../../../../lib/google-server';
import { digest, seal, unseal } from '../../../../../lib/google-crypto';
import { getDb } from '../../../../../db';
import { googleOAuthAttempts, googleConnections } from '../../../../../db/schema';
import { and, eq, gt } from 'drizzle-orm';
function back(status: string) { return new Response(null, { status: 303, headers: { Location: APP_ORIGIN + '/?calendar=' + status, 'Set-Cookie': 'campusos_google_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/google/oauth; Max-Age=0', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }); }
export async function GET(request: Request) { const user = await getChatGPTUser(); if (!user)
    return back('sign_in_required'); const url = new URL(request.url), state = url.searchParams.get('state') ?? ''; const cookie = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith('campusos_google_state='))?.split('=')[1]; if (!state || state !== cookie || !config().ready)
    return back('invalid_state'); let lockId: string | undefined; try {
    const rows = await getDb().delete(googleOAuthAttempts).where(and(eq(googleOAuthAttempts.stateHash, await digest(state)), eq(googleOAuthAttempts.userId, user.userId), gt(googleOAuthAttempts.expires, Date.now()))).returning();
    if (!rows.length)
        return back('invalid_state');
    if (url.searchParams.has('error'))
        return back('declined');
    const code = url.searchParams.get('code');
    if (!code)
        return back('invalid_state');
    lockId = await lock(user.userId);
    const verifier = await unseal(rows[0].verifier, config().secret, user.userId);
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: config().id, client_secret: config().secret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', code_verifier: verifier }), signal: AbortSignal.timeout(20000) });
    const token = await response.json() as {
        access_token?: string;
        refresh_token?: string;
        scope?: string;
    };
    if (!response.ok || !token.access_token)
        return back('failed');
    if (!token.scope?.split(' ').includes(GOOGLE_SCOPE))
        return back('permissions_missing');
    const account = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + token.access_token }, signal: AbortSignal.timeout(15000) });
    const info = await account.json() as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
    };
    if (!account.ok || !info.sub || !info.email)
        return back('failed');
    const existing = await connection(user.userId);
    if (existing?.googleSub && existing.googleSub !== info.sub)
        return back('different_account');
    const encrypted = token.refresh_token ? await seal(token.refresh_token, config().secret, user.userId) : existing?.refreshToken;
    if (!encrypted)
        return back('refresh_missing');
    await getDb().update(googleConnections).set({ googleSub: info.sub, email: info.email, refreshToken: encrypted, lastError: null }).where(eq(googleConnections.userId, user.userId));
    return back('connected');
}
catch {
    return back('failed');
}
finally {
    if (lockId)
        await unlock(user.userId, lockId);
} }
