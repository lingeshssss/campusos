import { getChatGPTUser } from '../../../chatgpt-auth';
import { connection, accessToken, googleRequest, ownerTag, lock, unlock, json, sameOrigin, report, CalendarError, readState } from '../../../../lib/google-server';
import { getDb } from '../../../../db';
import { googleConnections, googleSyncPlans } from '../../../../db/schema';
import { eq, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { desiredEvents, GoogleEvent, EventMap, SyncPlan } from '../../../../lib/google-events';
import { buildSyncActions } from '../../../../lib/google-plan';
import { randomToken } from '../../../../lib/google-crypto';
export async function POST(request: Request) { const user = await getChatGPTUser(); if (!user)
    return json({ error: 'Sign in first.' }, 401); if (!sameOrigin(request))
    return json({ error: 'Invalid request origin.' }, 403); let lockId: string | undefined; try {
    const options = z.object({ classes: z.boolean(), deadlines: z.boolean() }).parse(await request.json());
    if (!options.classes && !options.deadlines)
        throw new CalendarError('Choose classes, deadlines, or both.');
    lockId = await lock(user.userId);
    const conn = await connection(user.userId);
    if (!conn?.calendarId || !conn.googleSub)
        throw new CalendarError('Connect Google and create your CampusOS calendar first.');
    const { state, version } = await readState(user.userId);
    const owner = await ownerTag(user.userId), desired = desiredEvents(state, owner, options.classes, options.deadlines);
    const token = await accessToken(user.userId);
    const remote = new Map<string, GoogleEvent>();
    let pageToken = '';
    let pages = 0;
    const previewDeadline = Date.now() + 65000;
    do {
        if (Date.now() > previewDeadline)
            throw new CalendarError('Preview took too long. No Google changes were made; try again.', 503);
        const q = new URLSearchParams({ maxResults: '250', singleEvents: 'false', showDeleted: 'true' });
        if (pageToken)
            q.set('pageToken', pageToken);
        const response = await googleRequest(token, '/calendars/' + encodeURIComponent(conn.calendarId) + '/events?' + q.toString());
        if (!response)
            throw new CalendarError('Your CampusOS calendar is missing. Restore it in Google Calendar before syncing.', 404);
        for (const item of (response.items ?? []) as GoogleEvent[]) {
            if (item.id)
                remote.set(item.id, item);
        }
        pageToken = typeof response.nextPageToken === 'string' ? response.nextPageToken : '';
        if (++pages >= 16 && pageToken)
            throw new CalendarError('This calendar has too many events for a safe preview. No changes were made.');
    } while (pageToken);
    const result = buildSyncActions(desired, JSON.parse(conn.eventMap) as EventMap, remote, owner, options.classes, options.deadlines);
    const id = randomToken();
    const plan: SyncPlan = { stateVersion: version, calendarId: conn.calendarId, googleSub: conn.googleSub, actions: result.actions, unchanged: result.unchanged, ...options };
    await getDb().update(googleConnections).set({ eventMap: JSON.stringify(result.map), lastError: null }).where(eq(googleConnections.userId, user.userId));
    await getDb().delete(googleSyncPlans).where(or(eq(googleSyncPlans.userId, user.userId), lt(googleSyncPlans.expires, Date.now())));
    await getDb().insert(googleSyncPlans).values({ id, userId: user.userId, payload: JSON.stringify(plan), expires: Date.now() + 300000 });
    return json({ id, expires: Date.now() + 300000, actions: plan.actions, unchanged: plan.unchanged, batchSize: 20, version });
}
catch (e) {
    return report(e);
}
finally {
    if (lockId)
        await unlock(user.userId, lockId);
} }
