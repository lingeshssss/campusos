import { getChatGPTUser } from '../../../../chatgpt-auth';
import { config, REDIRECT_URI, GOOGLE_SCOPE, sameOrigin, json, readState } from '../../../../../lib/google-server';
import { randomToken, digest, seal } from '../../../../../lib/google-crypto';
import { getDb } from '../../../../../db';
import { googleOAuthAttempts } from '../../../../../db/schema';
import { eq, lt, or } from 'drizzle-orm';
export async function POST(request: Request) { const user = await getChatGPTUser(); if (!user)
    return json({ error: 'Sign in to CampusOS first.' }, 401); if (!sameOrigin(request))
    return json({ error: 'Invalid request origin.' }, 403); if (!config().ready)
    return json({ error: 'Google Calendar needs one-time OAuth setup by the app owner.' }, 503); try {
    await readState(user.userId);
    const consent = await request.formData();
    if (consent.get('consent') !== 'yes')
        return json({ error: 'Explicit permission is required before connecting.' }, 400);
    const state = randomToken(), verifier = randomToken();
    await getDb().delete(googleOAuthAttempts).where(or(eq(googleOAuthAttempts.userId, user.userId), lt(googleOAuthAttempts.expires, Date.now())));
    await getDb().insert(googleOAuthAttempts).values({ stateHash: await digest(state), userId: user.userId, verifier: await seal(verifier, config().secret, user.userId), expires: Date.now() + 600000 });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    Object.entries({ client_id: config().id, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'openid email ' + GOOGLE_SCOPE, access_type: 'offline', prompt: 'consent select_account', state, code_challenge: await digest(verifier), code_challenge_method: 'S256' }).forEach(([key, value]) => url.searchParams.set(key, value));
    return new Response(null, { status: 303, headers: { Location: url.toString(), 'Set-Cookie': `campusos_google_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/google/oauth; Max-Age=600`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
catch {
    return json({ error: 'Could not start Google authorization. Please retry.' }, 503);
} }
