import { getChatGPTUser } from '../../../chatgpt-auth';
import { connection, config, json, REDIRECT_URI, report } from '../../../../lib/google-server';
export async function GET() { const user = await getChatGPTUser(); if (!user)
    return json({ error: 'Sign in first.' }, 401); try {
    const row = await connection(user.userId);
    return json({ configured: config().ready, connected: !!row?.refreshToken, email: row?.email ?? null, calendarId: row?.calendarId ?? null, calendarStatus: row?.calendarStatus ?? 'none', lastSynced: row?.lastSynced ?? null, lastError: row?.lastError ?? null, busy: !!row?.lockId && (row?.lockUntil ?? 0) > Date.now(), redirectUri: REDIRECT_URI });
}
catch (e) {
    return report(e);
} }
