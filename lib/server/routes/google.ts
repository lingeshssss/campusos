import { and, eq, gt, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { googleConnections, googleOAuthAttempts, googleSyncPlans } from '../../../db/schema.ts';
import { calendarConfig, requireConfig, connection, accessToken, googleRequest, ownerTag, lock, unlock, report, CalendarError, readState, GOOGLE_SCOPE, STATE_COOKIE } from '../../google-server.ts';
import { digest, seal, unseal, randomToken } from '../../google-crypto.ts';
import { desiredEvents, type GoogleEvent, type EventMap, type SyncPlan } from '../../google-events.ts';
import { buildSyncActions } from '../../google-plan.ts';
import { secureCookies } from '../env.ts';
import { json, unauthorized, sameOrigin } from '../http.ts';
import type { ApiDeps } from '../types.ts';

const stateCookie = (value: string, maxAge: number, origin: string | null) =>
    `${STATE_COOKIE}=${value}; HttpOnly; ${secureCookies(origin) ? 'Secure; ' : ''}SameSite=Lax; Path=/api/google/oauth; Max-Age=${maxAge}`;

export function googleRoutes(deps: ApiDeps) {
    const f = () => deps.fetch ?? fetch;

    async function status(request: Request) {
        const user = await deps.user();
        if (!user) return unauthorized();
        try {
            const { config, originMismatch } = calendarConfig(request);
            const row = await connection(deps.db(), user.id);
            return json({ configured: config.ready && !originMismatch, connected: !!row?.refreshToken, email: row?.email ?? null, calendarId: row?.calendarId ?? null, calendarStatus: row?.calendarStatus ?? 'none', lastSynced: row?.lastSynced?.toISOString() ?? null, lastError: row?.lastError ?? null, busy: !!row?.lockId && (row?.lockUntil ?? 0) > Date.now(), redirectUri: config.redirectUri, missing: config.ready ? [] : config.missing, canonicalOrigin: originMismatch && config.ready ? config.origin : null });
        } catch (e) {
            return report(e);
        }
    }

    /** Form POST after the student ticks the explicit consent box. Redirects to Google with state + PKCE. */
    async function oauthStart(request: Request) {
        const user = await deps.user();
        if (!user) return unauthorized('Sign in to CampusOS first.');
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
        let config;
        try {
            config = requireConfig(request);
        } catch (e) {
            return report(e);
        }
        try {
            const db = deps.db();
            await readState(db, user.id);
            const consent = await request.formData();
            if (consent.get('consent') !== 'yes') return json({ error: 'Explicit permission is required before connecting.' }, 400);
            const state = randomToken(), verifier = randomToken();
            await db.delete(googleOAuthAttempts).where(or(eq(googleOAuthAttempts.userId, user.id), lt(googleOAuthAttempts.expires, Date.now())));
            await db.insert(googleOAuthAttempts).values({ stateHash: await digest(state), userId: user.id, verifier: await seal(verifier, config.key, user.id), expires: Date.now() + 600000 });
            const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
            Object.entries({ client_id: config.id, redirect_uri: config.redirectUri, response_type: 'code', scope: 'openid email ' + GOOGLE_SCOPE, access_type: 'offline', prompt: 'consent select_account', state, code_challenge: await digest(verifier), code_challenge_method: 'S256' }).forEach(([key, value]) => url.searchParams.set(key, value));
            return new Response(null, { status: 303, headers: { Location: url.toString(), 'Set-Cookie': stateCookie(state, 600, config.origin), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
        } catch (e) {
            if (e instanceof CalendarError) return report(e);
            console.error('oauth start failed', e);
            return json({ error: 'Could not start Google authorization. Please retry.' }, 503);
        }
    }

    async function oauthCallback(request: Request) {
        const { config, originMismatch } = calendarConfig(request);
        const base = config.ready ? config.origin : new URL(request.url).origin;
        const back = (status: string) => new Response(null, { status: 303, headers: { Location: base + '/?calendar=' + status, 'Set-Cookie': stateCookie('', 0, base), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
        const user = await deps.user();
        if (!user) return back('sign_in_required');
        const url = new URL(request.url), state = url.searchParams.get('state') ?? '';
        const cookie = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(STATE_COOKIE + '='))?.slice(STATE_COOKIE.length + 1);
        if (!state || state !== cookie || !config.ready || originMismatch) return back('invalid_state');
        const db = deps.db();
        let lockId: string | undefined;
        try {
            const rows = await db.delete(googleOAuthAttempts).where(and(eq(googleOAuthAttempts.stateHash, await digest(state)), eq(googleOAuthAttempts.userId, user.id), gt(googleOAuthAttempts.expires, Date.now()))).returning();
            if (!rows.length) return back('invalid_state');
            if (url.searchParams.has('error')) return back('declined');
            const code = url.searchParams.get('code');
            if (!code) return back('invalid_state');
            lockId = await lock(db, user.id);
            const verifier = await unseal(rows[0].verifier, config.key, user.id);
            const response = await f()('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: config.id, client_secret: config.secret, redirect_uri: config.redirectUri, grant_type: 'authorization_code', code_verifier: verifier }), signal: AbortSignal.timeout(20000) });
            const token = await response.json() as { access_token?: string; refresh_token?: string; scope?: string };
            if (!response.ok || !token.access_token) return back('failed');
            if (!token.scope?.split(' ').includes(GOOGLE_SCOPE)) return back('permissions_missing');
            const account = await f()('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + token.access_token }, signal: AbortSignal.timeout(15000) });
            const info = await account.json() as { sub?: string; email?: string };
            if (!account.ok || !info.sub || !info.email) return back('failed');
            const existing = await connection(db, user.id);
            if (existing?.googleSub && existing.googleSub !== info.sub) return back('different_account');
            const encrypted = token.refresh_token ? await seal(token.refresh_token, config.key, user.id) : existing?.refreshToken;
            if (!encrypted) return back('refresh_missing');
            await db.update(googleConnections).set({ googleSub: info.sub, email: info.email, refreshToken: encrypted, lastError: null }).where(eq(googleConnections.userId, user.id));
            return back('connected');
        } catch (e) {
            console.error('oauth callback failed', e);
            return back('failed');
        } finally {
            if (lockId) await unlock(db, user.id, lockId);
        }
    }

    async function createCalendar(request: Request) {
        const user = await deps.user();
        if (!user) return unauthorized();
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
        let lockId: string | undefined;
        const db = deps.db();
        try {
            const config = requireConfig(request);
            const data = z.object({ confirm: z.literal(true), recoverId: z.string().max(500).optional(), resetUncertain: z.boolean().optional() }).parse(await request.json());
            lockId = await lock(db, user.id);
            const row = await connection(db, user.id);
            if (!row?.refreshToken) throw new CalendarError('Connect Google first.', 401);
            if (row.calendarId) return json({ calendarId: row.calendarId });
            if (data.resetUncertain) {
                if (!['creating', 'uncertain'].includes(row.calendarStatus)) throw new CalendarError('No uncertain calendar creation to reset.');
                await db.update(googleConnections).set({ calendarStatus: 'none', lastError: null }).where(eq(googleConnections.userId, user.id));
                return json({ reset: true });
            }
            const token = await accessToken(db, config, user.id, f()), owner = await ownerTag(user.id);
            if (data.recoverId) {
                const calendar = await googleRequest(token, '/calendars/' + encodeURIComponent(data.recoverId), 'GET', undefined, undefined, f());
                if (!calendar || calendar.description !== `CampusOS managed calendar. Owner: ${owner}`) throw new CalendarError('This calendar does not match your CampusOS account. Check the Calendar ID.');
                await db.update(googleConnections).set({ calendarId: data.recoverId, calendarStatus: 'ready', lastError: null }).where(eq(googleConnections.userId, user.id));
                return json({ calendarId: data.recoverId });
            }
            if (row.calendarStatus !== 'none') throw new CalendarError('Calendar creation was not confirmed. Check Google Calendar and recover its ID before retrying.', 409);
            const { state } = await readState(db, user.id);
            await db.update(googleConnections).set({ calendarStatus: 'creating' }).where(eq(googleConnections.userId, user.id));
            try {
                const calendar = await googleRequest(token, '/calendars', 'POST', { summary: 'CampusOS', description: `CampusOS managed calendar. Owner: ${owner}`, timeZone: state.profile!.timezone }, undefined, f());
                if (typeof calendar?.id !== 'string') throw new Error('Missing calendar ID');
                await db.update(googleConnections).set({ calendarId: calendar.id, calendarStatus: 'ready', lastError: null }).where(eq(googleConnections.userId, user.id));
                return json({ calendarId: calendar.id });
            } catch (e) {
                const certain = e instanceof CalendarError && [400, 401, 403, 429].includes(e.code);
                await db.update(googleConnections).set({ calendarStatus: certain ? 'none' : 'uncertain', lastError: certain ? e.message : 'Google did not confirm calendar creation. Check Google Calendar before continuing.' }).where(eq(googleConnections.userId, user.id));
                throw e;
            }
        } catch (e) {
            return report(e);
        } finally {
            if (lockId) await unlock(db, user.id, lockId);
        }
    }

    async function preview(request: Request) {
        const user = await deps.user();
        if (!user) return unauthorized();
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
        let lockId: string | undefined;
        const db = deps.db();
        try {
            const config = requireConfig(request);
            const options = z.object({ classes: z.boolean(), deadlines: z.boolean() }).parse(await request.json());
            if (!options.classes && !options.deadlines) throw new CalendarError('Choose classes, deadlines, or both.');
            lockId = await lock(db, user.id);
            const conn = await connection(db, user.id);
            if (!conn?.calendarId || !conn.googleSub) throw new CalendarError('Connect Google and create your CampusOS calendar first.');
            const { state, version } = await readState(db, user.id);
            const owner = await ownerTag(user.id), desired = desiredEvents(state, owner, options.classes, options.deadlines);
            const token = await accessToken(db, config, user.id, f());
            const remote = new Map<string, GoogleEvent>();
            let pageToken = '', pages = 0;
            const previewDeadline = Date.now() + 65000;
            do {
                if (Date.now() > previewDeadline) throw new CalendarError('Preview took too long. No Google changes were made; try again.', 503);
                const q = new URLSearchParams({ maxResults: '250', singleEvents: 'false', showDeleted: 'true' });
                if (pageToken) q.set('pageToken', pageToken);
                const response = await googleRequest(token, '/calendars/' + encodeURIComponent(conn.calendarId) + '/events?' + q.toString(), 'GET', undefined, undefined, f());
                if (!response) throw new CalendarError('Your CampusOS calendar is missing. Restore it in Google Calendar before syncing.', 404);
                for (const item of (response.items ?? []) as GoogleEvent[]) if (item.id) remote.set(item.id, item);
                pageToken = typeof response.nextPageToken === 'string' ? response.nextPageToken : '';
                if (++pages >= 16 && pageToken) throw new CalendarError('This calendar has too many events for a safe preview. No changes were made.');
            } while (pageToken);
            const result = buildSyncActions(desired, conn.eventMap as EventMap, remote, owner, options.classes, options.deadlines);
            const id = randomToken(), expires = Date.now() + 300000;
            const plan: SyncPlan = { stateVersion: version, calendarId: conn.calendarId, googleSub: conn.googleSub, actions: result.actions, unchanged: result.unchanged, ...options };
            await db.update(googleConnections).set({ eventMap: result.map, lastError: null }).where(eq(googleConnections.userId, user.id));
            await db.delete(googleSyncPlans).where(or(eq(googleSyncPlans.userId, user.id), lt(googleSyncPlans.expires, Date.now())));
            await db.insert(googleSyncPlans).values({ id, userId: user.id, payload: plan, expires });
            return json({ id, expires, actions: plan.actions, unchanged: plan.unchanged, batchSize: 20, version });
        } catch (e) {
            if (e instanceof Error && e.message.includes('no longer belongs to CampusOS')) return report(new CalendarError(e.message, 409));
            return report(e);
        } finally {
            if (lockId) await unlock(db, user.id, lockId);
        }
    }

    async function sync(request: Request) {
        const user = await deps.user();
        if (!user) return unauthorized();
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
        let lockId: string | undefined, completed = 0;
        const db = deps.db();
        try {
            const config = requireConfig(request);
            const input = z.object({ planId: z.string().max(100), confirm: z.literal(true) }).parse(await request.json());
            lockId = await lock(db, user.id);
            const [saved] = await db.select().from(googleSyncPlans).where(and(eq(googleSyncPlans.id, input.planId), eq(googleSyncPlans.userId, user.id), eq(googleSyncPlans.used, false), gt(googleSyncPlans.expires, Date.now())));
            if (!saved) throw new CalendarError('This preview expired or was already used. Refresh the preview.', 409);
            const plan = saved.payload as SyncPlan, conn = await connection(db, user.id), current = await readState(db, user.id);
            if (!conn?.refreshToken || conn.calendarId !== plan.calendarId || conn.googleSub !== plan.googleSub) throw new CalendarError('The Google connection changed. Create a new preview.', 409);
            if (current.version !== plan.stateVersion) throw new CalendarError('Your classes or deadlines changed. Refresh the preview first.', 409);
            const token = await accessToken(db, config, user.id, f());
            // Single-use plan: a replayed or concurrent request cannot apply the same batch twice.
            const consumed = await db.update(googleSyncPlans).set({ used: true }).where(and(eq(googleSyncPlans.id, input.planId), eq(googleSyncPlans.userId, user.id), eq(googleSyncPlans.used, false))).returning({ id: googleSyncPlans.id });
            if (!consumed.length) throw new CalendarError('This preview has already been used.', 409);
            const map = structuredClone(conn.eventMap) as EventMap, start = Date.now();
            let message = '';
            for (const action of plan.actions.slice(0, 20)) {
                if (Date.now() - start > 50000) {
                    message = 'The batch paused at a safe boundary. Refresh the preview for remaining changes.';
                    break;
                }
                const path = '/calendars/' + encodeURIComponent(plan.calendarId) + '/events';
                try {
                    if (action.op === 'remove') {
                        if (!action.etag) throw new CalendarError('Event version missing. Refresh the preview.', 409);
                        await googleRequest(token, path + '/' + encodeURIComponent(action.eventId) + '?sendUpdates=none', 'DELETE', undefined, action.etag, f());
                        map[action.key] = { ...map[action.key], tombstone: true };
                    } else if (action.op === 'update') {
                        if (!action.etag) throw new CalendarError('Event version missing. Refresh the preview.', 409);
                        await googleRequest(token, path + '/' + encodeURIComponent(action.eventId) + '?sendUpdates=none', 'PUT', action.body, action.etag, f());
                        map[action.key] = { ...map[action.key], confirmed: true };
                    } else {
                        // Client-chosen event IDs make creates idempotent: a retry gets 409 instead of a duplicate.
                        await googleRequest(token, path + '?sendUpdates=none', 'POST', { ...action.body, id: action.eventId }, undefined, f());
                        map[action.key] = { ...map[action.key], confirmed: true };
                    }
                    completed++;
                    await db.update(googleConnections).set({ eventMap: map }).where(and(eq(googleConnections.userId, user.id), eq(googleConnections.lockId, lockId)));
                } catch (e) {
                    message = e instanceof CalendarError ? e.message : 'Google did not confirm the last change. Refresh the preview to reconcile before retrying.';
                    await db.update(googleConnections).set({ lastError: message }).where(eq(googleConnections.userId, user.id));
                    return json({ ok: false, completed, remaining: plan.actions.length - completed, message });
                }
            }
            const remaining = plan.actions.length - completed;
            await db.update(googleConnections).set({ lastSynced: remaining ? conn.lastSynced : new Date(), lastError: null }).where(eq(googleConnections.userId, user.id));
            return json({ ok: true, completed, remaining, message: message || (remaining ? 'Batch saved. Refresh the preview to review the remaining changes.' : 'Your CampusOS calendar is up to date.') });
        } catch (e) {
            return report(e);
        } finally {
            if (lockId) await unlock(db, user.id, lockId);
        }
    }

    async function disconnect(request: Request) {
        const user = await deps.user();
        if (!user) return unauthorized();
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
        let lockId: string | undefined;
        const db = deps.db();
        try {
            const body = await request.json() as { confirm?: boolean };
            if (body.confirm !== true) return json({ error: 'Confirm disconnection first.' }, 400);
            lockId = await lock(db, user.id);
            const row = await connection(db, user.id), { config } = calendarConfig(request);
            let revoked = false;
            if (row?.refreshToken && config.ready) {
                try {
                    const token = await unseal(row.refreshToken, config.key, user.id);
                    const result = await f()('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10000) });
                    revoked = result.ok;
                } catch { /* Local credential removal still stops CampusOS access. */ }
            }
            await db.update(googleConnections).set({ refreshToken: null, lastError: null }).where(eq(googleConnections.userId, user.id));
            await db.delete(googleSyncPlans).where(eq(googleSyncPlans.userId, user.id));
            await db.delete(googleOAuthAttempts).where(eq(googleOAuthAttempts.userId, user.id));
            return json({ disconnected: true, revoked, message: revoked ? 'Google access revoked. Existing calendar events are unchanged.' : 'CampusOS access removed. To ensure provider access is revoked, remove CampusOS in your Google Account connections. Existing events are unchanged.' });
        } catch (e) {
            return report(e);
        } finally {
            if (lockId) await unlock(db, user.id, lockId);
        }
    }

    return { status, oauthStart, oauthCallback, createCalendar, preview, sync, disconnect };
}
