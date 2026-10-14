import { getChatGPTUser } from '../../../chatgpt-auth';
import { connection, accessToken, googleRequest, ownerTag, lock, unlock, json, sameOrigin, report, CalendarError, readState } from '../../../../lib/google-server';
import { getDb } from '../../../../db';
import { googleConnections } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
export async function POST(request: Request) { const user = await getChatGPTUser(); if (!user)
    return json({ error: 'Sign in first.' }, 401); if (!sameOrigin(request))
    return json({ error: 'Invalid request origin.' }, 403); let lockId: string | undefined; try {
    const data = z.object({ confirm: z.literal(true), recoverId: z.string().max(500).optional(), resetUncertain: z.boolean().optional() }).parse(await request.json());
    lockId = await lock(user.userId);
    const row = await connection(user.userId);
    if (!row?.refreshToken)
        throw new CalendarError('Connect Google first.', 401);
    if (row.calendarId)
        return json({ calendarId: row.calendarId });
    if (data.resetUncertain) {
        if (!['creating', 'uncertain'].includes(row.calendarStatus))
            throw new CalendarError('No uncertain calendar creation to reset.');
        await getDb().update(googleConnections).set({ calendarStatus: 'none', lastError: null }).where(eq(googleConnections.userId, user.userId));
        return json({ reset: true });
    }
    const token = await accessToken(user.userId), owner = await ownerTag(user.userId);
    if (data.recoverId) {
        const calendar = await googleRequest(token, '/calendars/' + encodeURIComponent(data.recoverId));
        if (!calendar || calendar.description !== `CampusOS managed calendar. Owner: ${owner}`)
            throw new CalendarError('This calendar does not match your CampusOS account. Check the Calendar ID.');
        await getDb().update(googleConnections).set({ calendarId: data.recoverId, calendarStatus: 'ready', lastError: null }).where(eq(googleConnections.userId, user.userId));
        return json({ calendarId: data.recoverId });
    }
    if (row.calendarStatus !== 'none')
        throw new CalendarError('Calendar creation was not confirmed. Check Google Calendar and recover its ID before retrying.', 409);
    const { state } = await readState(user.userId);
    await getDb().update(googleConnections).set({ calendarStatus: 'creating' }).where(eq(googleConnections.userId, user.userId));
    try {
        const calendar = await googleRequest(token, '/calendars', 'POST', { summary: 'CampusOS', description: `CampusOS managed calendar. Owner: ${owner}`, timeZone: state.profile!.timezone });
        if (typeof calendar?.id !== 'string')
            throw new Error('Missing calendar ID');
        await getDb().update(googleConnections).set({ calendarId: calendar.id, calendarStatus: 'ready', lastError: null }).where(eq(googleConnections.userId, user.userId));
        return json({ calendarId: calendar.id });
    }
    catch (e) {
        const certain = e instanceof CalendarError && [400, 401, 403, 429].includes(e.code);
        await getDb().update(googleConnections).set({ calendarStatus: certain ? 'none' : 'uncertain', lastError: certain ? e.message : 'Google did not confirm calendar creation. Check Google Calendar before continuing.' }).where(eq(googleConnections.userId, user.userId));
        throw e;
    }
}
catch (e) {
    return report(e);
}
finally {
    if (lockId)
        await unlock(user.userId, lockId);
} }
