import { getChatGPTUser } from '../../../chatgpt-auth';
import { config, connection, lock, unlock, json, sameOrigin, report } from '../../../../lib/google-server';
import { unseal } from '../../../../lib/google-crypto';
import { getDb } from '../../../../db';
import { googleConnections, googleSyncPlans, googleOAuthAttempts } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
export async function POST(request: Request) { const user = await getChatGPTUser(); if (!user)
    return json({ error: 'Sign in first.' }, 401); if (!sameOrigin(request))
    return json({ error: 'Invalid request origin.' }, 403); let lockId: string | undefined; try {
    const body = await request.json() as {
        confirm?: boolean;
    };
    if (body.confirm !== true)
        return json({ error: 'Confirm disconnection first.' }, 400);
    lockId = await lock(user.userId);
    const row = await connection(user.userId);
    let revoked = false;
    if (row?.refreshToken && config().ready) {
        try {
            const token = await unseal(row.refreshToken, config().secret, user.userId);
            const result = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10000) });
            revoked = result.ok;
        }
        catch { /* Local credential removal still stops CampusOS access. */ }
    }
    await getDb().update(googleConnections).set({ refreshToken: null, lastError: null }).where(eq(googleConnections.userId, user.userId));
    await getDb().delete(googleSyncPlans).where(eq(googleSyncPlans.userId, user.userId));
    await getDb().delete(googleOAuthAttempts).where(eq(googleOAuthAttempts.userId, user.userId));
    return json({ disconnected: true, revoked, message: revoked ? 'Google access revoked. Existing calendar events are unchanged.' : 'CampusOS access removed. To ensure provider access is revoked, remove CampusOS in your Google Account connections. Existing events are unchanged.' });
}
catch (e) {
    return report(e);
}
finally {
    if (lockId)
        await unlock(user.userId, lockId);
} }
