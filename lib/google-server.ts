import { and, eq, lt, or, isNull } from 'drizzle-orm';
import { ZodError } from 'zod';
import { googleConnections } from '../db/schema.ts';
import type { Db } from '../db/types.ts';
import { unseal, digest, randomToken } from './google-crypto.ts';
import { googleConfig, type GoogleConfig } from './server/env.ts';
import { json } from './server/http.ts';
import { loadState, readStateRow } from './server/state-store.ts';

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export const STATE_COOKIE = 'campusos_google_state';

export type ReadyConfig = Extract<GoogleConfig, { ready: true }>;

export class CalendarError extends Error {
    code: number;
    constructor(message: string, code = 400) {
        super(message);
        this.code = code;
    }
}

/**
 * Calendar OAuth only runs on the canonical APP_ORIGIN. On any other host (for example a Vercel
 * Preview URL) the integration reports itself as unavailable instead of starting the production flow.
 */
export function calendarConfig(request: Request): { config: GoogleConfig; originMismatch: boolean } {
    const config = googleConfig();
    const originMismatch = config.ready && new URL(request.url).origin !== config.origin;
    return { config, originMismatch };
}

export function requireConfig(request: Request): ReadyConfig {
    const { config, originMismatch } = calendarConfig(request);
    if (!config.ready) throw new CalendarError('Google Calendar needs one-time OAuth setup by the app owner.', 503);
    if (originMismatch) throw new CalendarError(`Google Calendar is only available at ${config.origin}.`, 503);
    return config;
}

export async function connection(db: Db, userId: string) {
    const [row] = await db.select().from(googleConnections).where(eq(googleConnections.userId, userId));
    return row;
}

export async function readState(db: Db, userId: string) {
    if (!await readStateRow(db, userId)) throw new CalendarError('Finish onboarding first.');
    const { state, version } = await loadState(db, userId);
    return { state, version };
}

/** Stable tag embedded in managed calendars/events. Independent of hostname so a domain change does not orphan them. */
export async function ownerTag(userId: string) {
    return digest('CampusOS calendar owner\0' + userId);
}

/** Per-user mutual exclusion stored in Postgres (works across serverless instances). Expires after 3 minutes. */
export async function lock(db: Db, userId: string) {
    await db.insert(googleConnections).values({ userId }).onConflictDoNothing();
    const id = randomToken(), now = Date.now();
    const rows = await db.update(googleConnections).set({ lockId: id, lockUntil: now + 180000 }).where(and(eq(googleConnections.userId, userId), or(isNull(googleConnections.lockId), lt(googleConnections.lockUntil, now)))).returning({ userId: googleConnections.userId });
    if (!rows.length) throw new CalendarError('Another calendar action is running. Wait a moment, then refresh.', 409);
    return id;
}

export async function unlock(db: Db, userId: string, id: string) {
    await db.update(googleConnections).set({ lockId: null, lockUntil: 0 }).where(and(eq(googleConnections.userId, userId), eq(googleConnections.lockId, id)));
}

export async function accessToken(db: Db, config: ReadyConfig, userId: string, fetcher: typeof fetch = fetch) {
    const row = await connection(db, userId);
    if (!row?.refreshToken) throw new CalendarError('Connect Google Calendar first.', 401);
    let token: string;
    try {
        token = await unseal(row.refreshToken, config.key, userId);
    } catch {
        throw new CalendarError('Reconnect Google Calendar: the saved authorization could not be opened.', 401);
    }
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.id, client_secret: config.secret, grant_type: 'refresh_token', refresh_token: token }), signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => ({})) as { access_token?: string; error?: string };
    if (!response.ok || !data.access_token)
        throw new CalendarError(data.error === 'invalid_grant' ? 'Google authorization expired or was revoked. Reconnect to continue.' : 'Google authorization is temporarily unavailable. Try again later.', data.error === 'invalid_grant' ? 401 : 503);
    return data.access_token;
}

export async function googleRequest(token: string, path: string, method = 'GET', body?: unknown, etag?: string, fetcher: typeof fetch = fetch) {
    const response = await fetcher('https://www.googleapis.com/calendar/v3' + path, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(etag ? { 'If-Match': etag } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    if (method === 'GET' && (response.status === 404 || response.status === 410)) return null;
    if (method === 'DELETE' && (response.status === 404 || response.status === 410 || response.status === 204)) return {};
    if (!response.ok) {
        const messages: Record<number, string> = { 401: 'Google authorization expired. Reconnect to continue.', 403: 'Google denied access. Check Calendar API enablement and granted permissions.', 404: 'The CampusOS calendar is missing. Restore it in Google Calendar or reconnect.', 409: 'An event with this ID already exists. Refresh the preview to reconcile it.', 412: 'A Google event changed after your preview. Refresh the preview before syncing.', 429: 'Google is rate-limiting requests. Wait before trying again.' };
        throw new CalendarError(messages[response.status] || 'Google did not confirm the request. Refresh the preview to check what was saved.', response.status >= 500 ? 503 : response.status);
    }
    if (response.status === 204) return {};
    return response.json() as Promise<Record<string, unknown>>;
}

export function report(error: unknown) {
    if (error instanceof ZodError || error instanceof SyntaxError) return json({ error: 'Invalid calendar request.' }, 400);
    if (!(error instanceof CalendarError)) console.error('calendar action failed', error);
    return json({ error: error instanceof CalendarError ? error.message : 'Calendar action could not finish. Refresh to check its status.' }, error instanceof CalendarError ? error.code : 503);
}
