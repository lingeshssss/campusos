import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { testDb, request, deps, profile, course, ORIGIN } from './helpers/db.mjs';
import { stateRoutes } from '../lib/server/routes/state.ts';
import { accountRoutes } from '../lib/server/routes/account.ts';
import { bearerToken, userFromClaims } from '../lib/server/identity.ts';
import { sameOrigin } from '../lib/server/http.ts';
import { corsHeaders } from '../lib/server/cors.ts';
import { appleConfig, appleClientSecret, revokeAppleAuthorization } from '../lib/server/apple.ts';
import { appleAppSiteAssociation, mobileFallbackLink } from '../lib/server/app-links.ts';
import { planDeadlineReminders, planTimerReminder, planReminders, reminderId, TIMER_REMINDER_ID } from '../lib/reminders.ts';
import { newBoxKey, sealText, openText } from '../lib/crypto-box.ts';
import { createOfflineStore } from '../lib/offline-sync.ts';
import { ConflictError, OfflineError, SessionExpiredError } from '../shared/platform.ts';
import { stateSchema } from '../lib/model.ts';
import { defaultStudy } from '../lib/study.ts';
import { seal } from '../lib/google-crypto.ts';

let ctx;
before(async () => { ctx = await testDb(); });
const baseState = (extra = {}) => stateSchema.parse({ profile, courses: [course], ...extra });
const jwtLike = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln';

test('bearer header parsing never falls back to cookies on malformed input', () => {
    assert.equal(bearerToken(null), undefined);
    assert.equal(bearerToken(undefined), undefined);
    assert.equal(bearerToken(`Bearer ${jwtLike}`), jwtLike);
    for (const bad of ['', 'Bearer', 'Bearer ', 'Basic abc', `bearer ${jwtLike}`, 'Bearer not-a-jwt', `Bearer ${jwtLike} extra`]) assert.equal(bearerToken(bad), null, bad);
});

test('only signed-in, unexpired, non-anonymous claims become users', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const ok = userFromClaims({ sub: 'u1', role: 'authenticated', email: 'a@b.edu', exp, app_metadata: { provider: 'apple', providers: ['apple', 'email'] }, user_metadata: { full_name: 'Avery Lee' } });
    assert.deepEqual(ok, { id: 'u1', email: 'a@b.edu', name: 'Avery Lee', providers: ['apple', 'email'], authenticatedAt: null });
    assert.equal(userFromClaims({ sub: 'u1', role: 'anon', exp }), null);
    assert.equal(userFromClaims({ sub: 'u1', role: 'authenticated', is_anonymous: true, exp }), null);
    assert.equal(userFromClaims({ sub: 'u1', role: 'authenticated', exp: 1000 }), null);
    assert.equal(userFromClaims({ role: 'authenticated', exp }), null);
    assert.equal(userFromClaims(null), null);
});

test('cookie writes need a same-site Origin; bearer requests are exempt', () => {
    const r = (headers) => new Request(ORIGIN + '/api/state', { method: 'PUT', headers });
    assert.equal(sameOrigin(r({ origin: ORIGIN })), true);
    assert.equal(sameOrigin(r({ origin: 'https://evil.example' })), false);
    assert.equal(sameOrigin(r({})), false);
    assert.equal(sameOrigin(r({ origin: 'capacitor://localhost', authorization: `Bearer ${jwtLike}` })), true);
});

test('CORS allows only the native app origin, only for /api, never with credentials', () => {
    const h = corsHeaders('capacitor://localhost', '/api/state');
    assert.equal(h['Access-Control-Allow-Origin'], 'capacitor://localhost');
    assert.equal(h['Access-Control-Allow-Credentials'], undefined);
    assert.match(h['Access-Control-Allow-Headers'], /authorization/);
    assert.equal(corsHeaders('https://evil.example', '/api/state'), null);
    assert.equal(corsHeaders('capacitor://localhost', '/login'), null);
    assert.equal(corsHeaders(null, '/api/state'), null);
    assert.equal(corsHeaders('http://localhost', '/api/state'), null);
});

test('bearer-authenticated app requests can save state from the capacitor origin', async () => {
    const u = await ctx.addUser();
    const res = await stateRoutes(deps(ctx.db, u)).PUT(request('/api/state', { method: 'PUT', origin: 'capacitor://localhost', headers: { authorization: `Bearer ${jwtLike}` }, body: { state: baseState(), version: 0 } }));
    assert.equal(res.status, 200);
    const noToken = await stateRoutes(deps(ctx.db, u)).PUT(request('/api/state', { method: 'PUT', origin: 'capacitor://localhost', body: { state: baseState(), version: 1 } }));
    assert.equal(noToken.status, 403, 'a cross-origin cookie-style request is still refused');
});

const GOOGLE_ENV = { GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 's', TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'), APP_ORIGIN: ORIGIN };
async function withEnv(values, fn) {
    const keys = [...Object.keys(GOOGLE_ENV), 'APPLE_TEAM_ID', 'APPLE_SIGNIN_KEY_ID', 'APPLE_SIGNIN_PRIVATE_KEY', 'IOS_BUNDLE_ID'];
    const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, values);
    try { return await fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
const del = (user, body, opts = {}) => accountRoutes(deps(ctx.db, user, opts)).deleteAccount(request('/api/account/delete', { method: 'POST', body, ...opts.req }));

test('account deletion removes the auth user and every CampusOS row, after revoking Google access', () => withEnv(GOOGLE_ENV, async () => {
    const u = await ctx.addUser(), other = await ctx.addUser();
    await stateRoutes(deps(ctx.db, u)).PUT(request('/api/state', { method: 'PUT', body: { state: baseState(), version: 0 } }));
    await stateRoutes(deps(ctx.db, other)).PUT(request('/api/state', { method: 'PUT', body: { state: baseState(), version: 0 } }));
    await ctx.client.query('insert into google_connections (user_id, refresh_token) values ($1, $2)', [u.id, await seal('google-refresh', GOOGLE_ENV.TOKEN_ENCRYPTION_KEY, u.id)]);
    await ctx.client.query('insert into ai_parse_usage (user_id, window_start, count) values ($1, 1, 1)', [u.id]);
    assert.equal((await del(null, { confirm: 'DELETE' })).status, 401);
    assert.equal((await del(u, { confirm: 'delete' })).status, 400);
    assert.equal((await del(u, { confirm: 'DELETE' }, { req: { origin: 'https://evil.example' } })).status, 403);
    let revoked = '';
    const res = await del(u, { confirm: 'DELETE' }, { fetch: async (url, init) => { revoked = `${url} ${init.body.get('token')}`; return new Response(null, { status: 200 }); } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { deleted: true, googleRevoked: true, apple: 'not_apple' });
    assert.equal(revoked, 'https://oauth2.googleapis.com/revoke google-refresh');
    for (const t of ['student_states', 'google_connections', 'ai_parse_usage']) assert.equal((await ctx.client.query(`select 1 from ${t} where user_id = $1`, [u.id])).rows.length, 0, t);
    assert.equal((await ctx.client.query('select 1 from auth.users where id = $1', [u.id])).rows.length, 0);
    assert.equal((await ctx.client.query('select 1 from student_states where user_id = $1', [other.id])).rows.length, 1, 'other users untouched');
    assert.equal((await del(u, { confirm: 'DELETE' })).status, 404, 'a second attempt reports the account is gone');
}));

async function appleKeys() {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
    return { pair, pem: `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----` };
}

test('Apple client secret is a valid ES256 JWT for the bundle ID', async () => {
    const { pair, pem } = await appleKeys();
    assert.equal(appleConfig({ APPLE_TEAM_ID: 'ABCDE12345', APPLE_SIGNIN_KEY_ID: 'KEY1234567', IOS_BUNDLE_ID: 'com.example.campusos' }), null, 'private key required');
    const config = appleConfig({ APPLE_TEAM_ID: 'ABCDE12345', APPLE_SIGNIN_KEY_ID: 'KEY1234567', IOS_BUNDLE_ID: 'com.example.campusos', APPLE_SIGNIN_PRIVATE_KEY: pem.replaceAll('\n', '\\n') });
    assert.ok(config);
    const jwt = await appleClientSecret(config, 1_800_000_000);
    const [h, p, s] = jwt.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY1234567' });
    assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), { iss: 'ABCDE12345', iat: 1_800_000_000, exp: 1_800_000_300, aud: 'https://appleid.apple.com', sub: 'com.example.campusos' });
    assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${p}`)), true);
});

test('Apple users: deletion revokes with a fresh authorization code, and reports when it could not', async () => {
    const { pem } = await appleKeys();
    const APPLE = { APPLE_TEAM_ID: 'ABCDE12345', APPLE_SIGNIN_KEY_ID: 'KEY1234567', IOS_BUNDLE_ID: 'com.example.campusos', APPLE_SIGNIN_PRIVATE_KEY: pem };
    const calls = [];
    const appleFetch = async (url, init) => {
        calls.push([String(url), Object.fromEntries(init.body)]);
        return String(url).endsWith('/auth/token') ? Response.json({ refresh_token: 'apple-rt' }) : new Response(null, { status: 200 });
    };
    await withEnv(APPLE, async () => {
        const u = { ...(await ctx.addUser()), providers: ['apple'] };
        const res = await del(u, { confirm: 'DELETE', appleAuthorizationCode: 'code-123' }, { fetch: appleFetch });
        assert.equal((await res.json()).apple, 'revoked');
        assert.equal(calls[0][0], 'https://appleid.apple.com/auth/token');
        assert.equal(calls[0][1].code, 'code-123');
        assert.equal(calls[0][1].client_id, 'com.example.campusos');
        assert.deepEqual([calls[1][0], calls[1][1].token, calls[1][1].token_type_hint], ['https://appleid.apple.com/auth/revoke', 'apple-rt', 'refresh_token']);
        const u2 = { ...(await ctx.addUser()), providers: ['apple'] };
        assert.equal((await (await del(u2, { confirm: 'DELETE' }, { fetch: appleFetch })).json()).apple, 'code_missing');
    });
    await withEnv({}, async () => {
        const u3 = { ...(await ctx.addUser()), providers: ['apple'] };
        assert.equal((await (await del(u3, { confirm: 'DELETE', appleAuthorizationCode: 'x' })).json()).apple, 'not_configured');
    });
    const failing = await revokeAppleAuthorization(appleConfig(APPLE), 'bad', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    assert.equal(failing, false);
});

test('universal link association and fallback link only expose allowed values', () => {
    assert.equal(appleAppSiteAssociation({}), null);
    assert.equal(appleAppSiteAssociation({ APPLE_TEAM_ID: 'bad', IOS_BUNDLE_ID: 'com.x' }), null);
    assert.deepEqual(appleAppSiteAssociation({ APPLE_TEAM_ID: 'ABCDE12345', IOS_BUNDLE_ID: 'com.example.campusos' }).applinks.details[0].appIDs, ['ABCDE12345.com.example.campusos']);
    assert.equal(mobileFallbackLink({ code: 'abc', next: 'update-password', evil: 'x' }), 'campusos://auth/callback?code=abc&next=update-password');
    assert.equal(mobileFallbackLink({ code: 'abc', next: 'https://evil.example' }), 'campusos://auth/callback?code=abc');
    assert.equal(mobileFallbackLink({ next: 'update-password' }), null);
});

const deadline = (over) => ({ id: crypto.randomUUID(), title: 'Midterm', courseCode: 'CS111', kind: 'exam', date: '2026-11-10', time: '', weight: null, done: false, notes: '', source: '', updatedAt: '2026-10-01T00:00:00.000Z', ...over });

test('deadline reminders mirror .ics alarms in campus time, skip past/done items and respect the iOS limit', () => {
    const state = baseState({ deadlines: [deadline({}), deadline({ kind: 'homework', title: 'HW 3', time: '23:59', date: '2026-11-03' }), deadline({ done: true }), deadline({ date: '2026-10-15' })] });
    const now = new Date('2026-10-20T12:00:00Z');
    const plan = planDeadlineReminders(state, now);
    assert.deepEqual(plan.map(r => [r.title, r.at.toISOString()]), [
        ['CS111: HW 3', '2026-11-03T04:59:00.000Z'],        // Nov 2 23:59 EST (UTC-5), 1 day before
        ['CS111: Midterm', '2026-11-03T14:00:00.000Z'],     // Nov 3 09:00 EST, 7 days before
        ['CS111: Midterm', '2026-11-09T14:00:00.000Z'],     // Nov 9 09:00 EST, 1 day before
    ]);
    assert.equal(plan[0].body, 'Due tomorrow at 23:59.');
    assert.equal(new Set(plan.map(r => r.id)).size, 3);
    assert.equal(reminderId('a'), reminderId('a'));
    const many = baseState({ deadlines: Array.from({ length: 80 }, (_, i) => deadline({ title: 'D' + i, date: `2026-12-${String(1 + (i % 28)).padStart(2, '0')}`, kind: 'quiz' })) });
    assert.equal(planDeadlineReminders(many, now).length, 60);
});

test('timer reminder fires at the end of a running session only', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const running = { ...defaultStudy(), timer: { id: crypto.randomUUID(), courseCode: 'CS111', kind: 'focus', duration: 1500, remaining: 1500, startedAt: '2026-10-20T11:55:00.000Z' } };
    const r = planTimerReminder(baseState({ study: running }), now);
    assert.equal(r.id, TIMER_REMINDER_ID);
    assert.equal(r.at.toISOString(), '2026-10-20T12:20:00.000Z');
    assert.equal(planTimerReminder(baseState({ study: { ...running, timer: { ...running.timer, startedAt: null } } }), now), null, 'paused');
    assert.equal(planTimerReminder(baseState({ study: { ...running, timer: { ...running.timer, startedAt: '2026-10-20T10:00:00.000Z' } } }), now), null, 'already finished');
    assert.equal(planReminders(baseState({ study: running }), now, { deadlines: false, timer: false }).length, 0);
});

test('on-device data is encrypted and bound to the user', async () => {
    const key = newBoxKey(), text = JSON.stringify({ secret: 'grades', pad: 'x'.repeat(2_500_000) });
    const sealed = await sealText(text, key, 'user-a');
    assert.doesNotMatch(sealed.slice(0, 5000), /grades/);
    assert.equal(await openText(sealed, key, 'user-a'), text);
    await assert.rejects(openText(sealed, key, 'user-b'));
    await assert.rejects(openText(sealed, newBoxKey(), 'user-a'));
});

function fakeRemote(initial) {
    const server = { state: initial, version: 1 }, log = [];
    let online = true;
    return {
        server, log, setOnline: v => { online = v; },
        remote: {
            async load() { if (!online) throw new OfflineError(); return { state: server.state, version: server.version }; },
            async save(state, version) {
                if (!online) throw new OfflineError();
                log.push(version);
                if (version !== server.version) throw new ConflictError('changed');
                server.state = state; server.version += 1;
                return { version: server.version };
            },
        },
    };
}
const memoryCache = () => { let s = null; return { read: async () => s && structuredClone(s), write: async v => { s = structuredClone(v); }, peek: () => s }; };

test('offline: reads fall back to the device copy and edits queue against their base version', async () => {
    const f = fakeRemote(baseState()), cache = memoryCache();
    const store = createOfflineStore({ userId: 'u', remote: f.remote, cache });
    assert.equal((await store.load()).version, 1);
    f.setOnline(false);
    const reopened = createOfflineStore({ userId: 'u', remote: f.remote, cache });
    const offline = await reopened.load();
    assert.equal(offline.state.courses[0].code, 'CS111', 'schedule readable offline');
    assert.equal(reopened.status().mode, 'offline');
    const edited = { ...offline.state, courses: [] };
    assert.deepEqual(await reopened.save(edited, 1), { version: 1, queued: true });
    assert.deepEqual(await reopened.save({ ...edited, deadlines: [deadline({})] }, 1), { version: 1, queued: true });
    assert.equal(reopened.pending().baseVersion, 1);
    assert.equal(cache.peek().pending.state.deadlines.length, 1, 'queued edits persist on the device');
    assert.equal(f.server.version, 1, 'server untouched while offline');
    f.setOnline(true);
    const seen = [];
    reopened.subscribe(l => seen.push(l.version));
    await reopened.sync();
    assert.equal(f.server.version, 2);
    assert.equal(f.server.state.deadlines.length, 1);
    assert.equal(reopened.pending(), null);
    assert.deepEqual(seen, [2]);
    assert.equal(reopened.status().mode, 'online');
});

test('offline: a server change while offline becomes an explicit conflict, resolvable either way', async () => {
    for (const choice of ['server', 'mine']) {
        const f = fakeRemote(baseState()), cache = memoryCache();
        const store = createOfflineStore({ userId: 'u', remote: f.remote, cache });
        const loaded = await store.load();
        f.setOnline(false);
        await store.save({ ...loaded.state, courses: [] }, 1);
        f.server.state = { ...loaded.state, deadlines: [deadline({ title: 'From laptop' })] };
        f.server.version = 2;
        f.setOnline(true);
        await store.sync();
        assert.equal(store.status().mode, 'conflict');
        assert.equal(store.status().server.version, 2);
        assert.equal(f.server.state.deadlines[0].title, 'From laptop', 'nothing overwritten without a decision');
        assert.deepEqual(await store.save({ ...loaded.state, courses: [], grading: [] }, 1), { version: 1, queued: true }, 'edits during a conflict stay queued');
        await store.resolveConflict(choice);
        assert.equal(store.status().mode, 'online');
        assert.equal(store.pending(), null);
        if (choice === 'server') { assert.equal(f.server.version, 2); assert.equal(f.server.state.courses.length, 1); }
        else { assert.equal(f.server.version, 3); assert.equal(f.server.state.courses.length, 0); }
    }
});

test('offline store ignores another user’s cached copy and surfaces session expiry', async () => {
    const f = fakeRemote(baseState()), cache = memoryCache();
    await createOfflineStore({ userId: 'user-a', remote: f.remote, cache }).load();
    f.setOnline(false);
    await assert.rejects(createOfflineStore({ userId: 'user-b', remote: f.remote, cache }).load(), /doesn’t have a saved copy/);
    const expired = createOfflineStore({ userId: 'u', remote: { load: async () => { throw new SessionExpiredError(); }, save: async () => { throw new SessionExpiredError(); } }, cache: memoryCache() });
    await assert.rejects(expired.load(), SessionExpiredError);
});
