import { env } from 'cloudflare:workers';
import { getDb } from '../db';
import { googleConnections, studentStates } from '../db/schema';
import { and, eq, lt, or, isNull } from 'drizzle-orm';
import { stateSchema } from './model';
import { unseal, digest, randomToken } from './google-crypto';
export const APP_ORIGIN = 'https://campusos-daily-lingesh.humblelynx9.chatgpt.site';
export const REDIRECT_URI = APP_ORIGIN + '/api/google/oauth/callback';
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export function config() { const values = env as unknown as {
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
}; return { id: values.GOOGLE_CLIENT_ID ?? '', secret: values.GOOGLE_CLIENT_SECRET ?? '', ready: !!values.GOOGLE_CLIENT_ID?.endsWith('.apps.googleusercontent.com') && !!values.GOOGLE_CLIENT_SECRET }; }
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function sameOrigin(request: Request) { return request.headers.get('origin') === new URL(request.url).origin; }
export class CalendarError extends Error {
    constructor(message: string, public code = 400) { super(message); }
}
export async function connection(userId: string) { const [row] = await getDb().select().from(googleConnections).where(eq(googleConnections.userId, userId)); return row; }
export async function readState(userId: string) { const [row] = await getDb().select().from(studentStates).where(eq(studentStates.userId, userId)); if (!row)
    throw new CalendarError('Finish onboarding first.'); return { state: stateSchema.parse(JSON.parse(row.payload)), version: row.version }; }
export async function ownerTag(userId: string) { return digest(APP_ORIGIN + '\0' + userId); }
export async function lock(userId: string) { await getDb().insert(googleConnections).values({ userId }).onConflictDoNothing(); const id = randomToken(), now = Date.now(); const rows = await getDb().update(googleConnections).set({ lockId: id, lockUntil: now + 180000 }).where(and(eq(googleConnections.userId, userId), or(isNull(googleConnections.lockId), lt(googleConnections.lockUntil, now)))).returning(); if (!rows.length)
    throw new CalendarError('Another calendar action is running. Wait a moment, then refresh.', 409); return id; }
export async function unlock(userId: string, id: string) { await getDb().update(googleConnections).set({ lockId: null, lockUntil: 0 }).where(and(eq(googleConnections.userId, userId), eq(googleConnections.lockId, id))); }
export async function accessToken(userId: string) { if (!config().ready)
    throw new CalendarError('Google Calendar needs one-time OAuth setup by the app owner.', 503); const row = await connection(userId); if (!row?.refreshToken)
    throw new CalendarError('Connect Google Calendar first.', 401); let token: string; try {
    token = await unseal(row.refreshToken, config().secret, userId);
}
catch {
    throw new CalendarError('Reconnect Google Calendar: the saved authorization could not be opened.', 401);
} const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config().id, client_secret: config().secret, grant_type: 'refresh_token', refresh_token: token }), signal: AbortSignal.timeout(15000) }); const data = await response.json() as {
    access_token?: string;
    error?: string;
}; if (!response.ok || !data.access_token)
    throw new CalendarError(data.error === 'invalid_grant' ? 'Google authorization expired or was revoked. Reconnect to continue.' : 'Google authorization is temporarily unavailable. Try again later.', data.error === 'invalid_grant' ? 401 : 503); return data.access_token; }
export async function googleRequest(token: string, path: string, method = 'GET', body?: unknown, etag?: string) { const response = await fetch('https://www.googleapis.com/calendar/v3' + path, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(etag ? { 'If-Match': etag } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) }); if (method === 'GET' && (response.status === 404 || response.status === 410))
    return null; if (method === 'DELETE' && (response.status === 404 || response.status === 410 || response.status === 204))
    return {}; if (!response.ok) {
    const messages: Record<number, string> = { 401: 'Google authorization expired. Reconnect to continue.', 403: 'Google denied access. Check Calendar API enablement and granted permissions.', 404: 'The CampusOS calendar is missing. Restore it in Google Calendar or reconnect.', 409: 'An event with this ID already exists. Refresh the preview to reconcile it.', 412: 'A Google event changed after your preview. Refresh the preview before syncing.', 429: 'Google is rate-limiting requests. Wait before trying again.' };
    throw new CalendarError(messages[response.status] || 'Google did not confirm the request. Refresh the preview to check what was saved.', response.status >= 500 ? 503 : response.status);
} if (response.status === 204)
    return {}; return response.json() as Promise<Record<string, unknown>>; }
export function report(error: unknown) { return json({ error: error instanceof CalendarError ? error.message : 'Calendar action could not finish. Refresh to check its status.' }, error instanceof CalendarError ? error.code : 503); }
