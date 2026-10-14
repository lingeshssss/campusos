import { getChatGPTUser } from '../../../chatgpt-auth';
import { connection, accessToken, googleRequest, lock, unlock, json, sameOrigin, report, CalendarError, readState } from '../../../../lib/google-server';
import { getDb } from '../../../../db';
import { googleConnections, googleSyncPlans } from '../../../../db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { SyncPlan, EventMap } from '../../../../lib/google-events';
export async function POST(request: Request) { const user = await getChatGPTUser(); if (!user)
    return json({ error: 'Sign in first.' }, 401); if (!sameOrigin(request))
    return json({ error: 'Invalid request origin.' }, 403); let lockId: string | undefined; let completed = 0; try {
    const input = z.object({ planId: z.string().max(100), confirm: z.literal(true) }).parse(await request.json());
    lockId = await lock(user.userId);
    const [saved] = await getDb().select().from(googleSyncPlans).where(and(eq(googleSyncPlans.id, input.planId), eq(googleSyncPlans.userId, user.userId), eq(googleSyncPlans.used, 0), gt(googleSyncPlans.expires, Date.now())));
    if (!saved)
        throw new CalendarError('This preview expired or was already used. Refresh the preview.', 409);
    const plan = JSON.parse(saved.payload) as SyncPlan, conn = await connection(user.userId), current = await readState(user.userId);
    if (!conn?.refreshToken || conn.calendarId !== plan.calendarId || conn.googleSub !== plan.googleSub)
        throw new CalendarError('The Google connection changed. Create a new preview.', 409);
    if (current.version !== plan.stateVersion)
        throw new CalendarError('Your classes or deadlines changed. Refresh the preview first.', 409);
    const token = await accessToken(user.userId);
    const consumed = await getDb().update(googleSyncPlans).set({ used: 1 }).where(and(eq(googleSyncPlans.id, input.planId), eq(googleSyncPlans.used, 0))).returning();
    if (!consumed.length)
        throw new CalendarError('This preview has already been used.', 409);
    const map = JSON.parse(conn.eventMap) as EventMap, start = Date.now();
    let message = '';
    for (const action of plan.actions.slice(0, 20)) {
        if (Date.now() - start > 50000) {
            message = 'The batch paused at a safe boundary. Refresh the preview for remaining changes.';
            break;
        }
        const path = '/calendars/' + encodeURIComponent(plan.calendarId) + '/events';
        try {
            if (action.op === 'remove') {
                if (!action.etag)
                    throw new CalendarError('Event version missing. Refresh the preview.', 409);
                await googleRequest(token, path + '/' + encodeURIComponent(action.eventId) + '?sendUpdates=none', 'DELETE', undefined, action.etag);
                map[action.key] = { ...map[action.key], tombstone: true };
            }
            else if (action.op === 'update') {
                if (!action.etag)
                    throw new CalendarError('Event version missing. Refresh the preview.', 409);
                await googleRequest(token, path + '/' + encodeURIComponent(action.eventId) + '?sendUpdates=none', 'PUT', action.body, action.etag);
                map[action.key] = { ...map[action.key], confirmed: true };
            }
            else {
                await googleRequest(token, path + '?sendUpdates=none', 'POST', { ...action.body, id: action.eventId });
                map[action.key] = { ...map[action.key], confirmed: true };
            }
            completed++;
            await getDb().update(googleConnections).set({ eventMap: JSON.stringify(map) }).where(and(eq(googleConnections.userId, user.userId), eq(googleConnections.lockId, lockId)));
        }
        catch (e) {
            message = e instanceof CalendarError ? e.message : 'Google did not confirm the last change. Refresh the preview to reconcile before retrying.';
            await getDb().update(googleConnections).set({ lastError: message }).where(eq(googleConnections.userId, user.userId));
            return json({ ok: false, completed, remaining: plan.actions.length - completed, message });
        }
    }
    const remaining = plan.actions.length - completed;
    await getDb().update(googleConnections).set({ lastSynced: remaining ? conn.lastSynced : new Date().toISOString(), lastError: null }).where(eq(googleConnections.userId, user.userId));
    return json({ ok: true, completed, remaining, message: message || (remaining ? 'Batch saved. Refresh the preview to review the remaining changes.' : 'Your CampusOS calendar is up to date.') });
}
catch (e) {
    return report(e);
}
finally {
    if (lockId)
        await unlock(user.userId, lockId);
} }
