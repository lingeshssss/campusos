import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { testDb, request, deps, profile, course, ORIGIN } from './helpers/db.mjs';
import { stateRoutes, exportRoutes, importRoutes } from '../lib/server/routes/state.ts';
import { calendarRoutes, bookRoutes, plannerRoutes, parseRoutes } from '../lib/server/routes/tools.ts';
import { googleRoutes } from '../lib/server/routes/google.ts';
import { consumeAiQuota, AI_CALLS_PER_HOUR } from '../lib/server/ai-quota.ts';
import { safeNextPath } from '../lib/safe-redirect.ts';
import { appOrigin, googleConfig, tokenKey } from '../lib/server/env.ts';
import { defaultStudy } from '../lib/study.ts';
import { defaultPlanner } from '../lib/planner.ts';

let ctx;
before(async () => { ctx = await testDb(); });

const forged = { 'oai-authenticated-user-id': 'user-123', 'oai-authenticated-user-email': 'victim@example.edu', 'oai-authenticated-user-full-name': 'Victim' };
const fullState = (extra = {}) => ({ profile, courses: [course], deadlines: [], grading: [], books: [], gradeCourses: [], gpaSettings: undefined, planner: defaultPlanner(), study: defaultStudy(), ...extra });

async function save(user, state, version) {
    return stateRoutes(deps(ctx.db, user)).PUT(request('/api/state', { method: 'PUT', body: { state, version } }));
}
async function load(user) {
    return (await stateRoutes(deps(ctx.db, user)).GET()).json();
}

function privateEndpoints(d) {
    const s = stateRoutes(d), g = googleRoutes(d), p = parseRoutes(d);
    return [
        ['GET /api/state', () => s.GET()],
        ['PUT /api/state', () => s.PUT(request('/api/state', { method: 'PUT', body: { state: fullState(), version: 0 }, headers: forged }))],
        ['GET /api/export', () => exportRoutes(d).GET()],
        ['POST /api/import', () => importRoutes(d).POST(request('/api/import', { method: 'POST', body: { mode: 'preview', document: {} }, headers: forged }))],
        ['GET /api/calendar', () => calendarRoutes(d).GET(request('/api/calendar?classes=1', { headers: forged }))],
        ['GET /api/books', () => bookRoutes(d).GET(request('/api/books?isbn=9780306406157', { headers: forged }))],
        ['POST /api/planner', () => plannerRoutes(d).POST(request('/api/planner', { method: 'POST', body: defaultPlanner(), headers: forged }))],
        ['GET /api/parse', () => p.GET()],
        ['POST /api/parse', () => p.POST(request('/api/parse', { method: 'POST', body: { kind: 'syllabus', text: 'Midterm Oct 5' }, headers: forged }))],
        ['GET /api/google/status', () => g.status(request('/api/google/status', { headers: forged }))],
        ['POST /api/google/oauth/start', () => g.oauthStart(request('/api/google/oauth/start', { method: 'POST', body: 'consent=yes', headers: { ...forged, 'content-type': 'application/x-www-form-urlencoded' } }))],
        ['POST /api/google/calendar', () => g.createCalendar(request('/api/google/calendar', { method: 'POST', body: { confirm: true }, headers: forged }))],
        ['POST /api/google/preview', () => g.preview(request('/api/google/preview', { method: 'POST', body: { classes: true, deadlines: true }, headers: forged }))],
        ['POST /api/google/sync', () => g.sync(request('/api/google/sync', { method: 'POST', body: { planId: 'x', confirm: true }, headers: forged }))],
        ['POST /api/google/disconnect', () => g.disconnect(request('/api/google/disconnect', { method: 'POST', body: { confirm: true }, headers: forged }))],
    ];
}

test('every private endpoint rejects anonymous requests, even with forged ChatGPT identity headers', async () => {
    let dbTouched = false;
    const d = { user: async () => null, db: () => { dbTouched = true; return ctx.db; }, fetch: async () => { throw Error('no upstream call expected'); } };
    for (const [name, call] of privateEndpoints(d)) {
        const res = await call();
        assert.equal(res.status, 401, name);
        assert.equal((await res.json()).code, 'unauthenticated', name);
    }
    assert.equal(dbTouched, false, 'anonymous requests must not reach the database');
    const callback = await googleRoutes(d).oauthCallback(request('/api/google/oauth/callback?state=a&code=b', { headers: { ...forged, cookie: 'campusos_google_state=a' } }));
    assert.equal(callback.status, 303);
    assert.match(callback.headers.get('location'), /calendar=sign_in_required$/);
});

test('no runtime source reads ChatGPT hosting headers or Cloudflare bindings', () => {
    const banned = /oai-authenticated|signin-with-chatgpt|signout-with-chatgpt|cloudflare:workers|drizzle-orm\/d1|env\.DB\b|vinext|chatgpt\.site/;
    const walk = dir => readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx|mts|mjs|js)$/.test(name) ? [path] : [];
    });
    const files = ['app', 'lib', 'db', 'components', 'hooks', 'shared', 'mobile/src'].flatMap(walk).concat(['proxy.ts', 'next.config.ts', 'drizzle.config.ts']);
    for (const file of files) assert.doesNotMatch(readFileSync(file, 'utf8'), banned, file);
});

test('state persists per user and user B can never read or overwrite user A', async () => {
    const a = await ctx.addUser(), b = await ctx.addUser();
    assert.equal((await save(a, fullState(), 0)).status, 200);
    const fromA = await load(a);
    assert.equal(fromA.version, 1);
    assert.equal(fromA.state.courses[0].code, 'CS111');
    const fromB = await load(b);
    assert.equal(fromB.version, 0);
    assert.equal(fromB.state.profile, null);
    assert.deepEqual(fromB.state.courses, []);
    // B tries to write using A's version number: only B's own (missing) row is ever targeted.
    const attack = await save(b, fullState({ courses: [] }), 1);
    assert.equal(attack.status, 409);
    assert.equal((await load(a)).state.courses.length, 1);
    const exportB = await (await exportRoutes(deps(ctx.db, b)).GET()).text();
    assert.doesNotMatch(exportB, /CS111/);
    // Forged headers cannot switch identity: the injected session user is the only identity source.
    const forgedSave = await stateRoutes(deps(ctx.db, b)).PUT(request('/api/state', { method: 'PUT', body: { state: fullState({ courses: [] }), version: 1 }, headers: { ...forged, 'oai-authenticated-user-id': a.id } }));
    assert.equal(forgedSave.status, 409);
    assert.equal((await load(a)).state.courses.length, 1);
});

test('optimistic concurrency rejects stale versions and old tabs cannot erase newer fields', async () => {
    const u = await ctx.addUser();
    assert.equal((await save(u, fullState(), 0)).status, 200);
    const stale = await save(u, fullState(), 0);
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, 'conflict');
    const deadline = { id: '8b9f8a2c-8f8c-4a51-9a63-3e3b3b8c1d11', courseCode: 'CS111', title: 'Midterm', date: '2026-10-05', time: '', kind: 'exam', weight: 20, source: '', notes: '', done: false, updatedAt: '2026-10-01T00:00:00.000Z' };
    const withDeadline = await save(u, fullState({ deadlines: [deadline] }), 1);
    assert.equal(withDeadline.status, 200, await withDeadline.clone().text());
    const oldTab = fullState();
    delete oldTab.deadlines;
    assert.equal((await save(u, oldTab, 2)).status, 200);
    const now = await load(u);
    assert.equal(now.version, 3);
    assert.equal(now.state.deadlines.length, 1);
    assert.equal((await save(u, fullState(), 1)).status, 409);
});

test('state writes reject cross-origin requests and invalid payloads', async () => {
    const u = await ctx.addUser();
    const cross = await stateRoutes(deps(ctx.db, u)).PUT(request('/api/state', { method: 'PUT', body: { state: fullState(), version: 0 }, origin: 'https://evil.example' }));
    assert.equal(cross.status, 403);
    const noOrigin = await stateRoutes(deps(ctx.db, u)).PUT(request('/api/state', { method: 'PUT', body: { state: fullState(), version: 0 }, origin: null }));
    assert.equal(noOrigin.status, 403);
    assert.equal((await save(u, fullState({ courses: [{ ...course, end: '09:00' }] }), 0)).status, 400);
    assert.equal((await stateRoutes(deps(ctx.db, u)).PUT(request('/api/state', { method: 'PUT', body: 'x'.repeat(3_000_001) }))).status, 413);
});

const exportDoc = (state, extra = {}) => ({ format: 'campusos-student-data', schemaVersion: 7, exportedAt: '2026-10-14T12:00:00.000Z', state, ...extra });
const importer = (user, now = Date.parse('2026-10-15T12:00:00Z')) => importRoutes(deps(ctx.db, user, { now: () => now }));
const post = (user, body, opts) => importer(user).POST(request('/api/import', { method: 'POST', body, ...opts }));

test('import previews, requires confirmation and the current version, then replaces only the signed-in user', async () => {
    const owner = await ctx.addUser(), other = await ctx.addUser();
    await save(owner, fullState({ courses: [] }), 0);
    await save(other, fullState(), 0);
    const doc = exportDoc(fullState({ books: [] }));
    const preview = await post(owner, { mode: 'preview', document: doc });
    assert.equal(preview.status, 200);
    const p = await preview.json();
    assert.equal(p.summary.courses, 1);
    assert.equal(p.current.version, 1);
    assert.equal(p.current.summary.courses, 0);
    assert.equal((await load(owner)).state.courses.length, 0, 'preview must not write');
    assert.equal((await post(owner, { mode: 'replace', document: doc, expectedVersion: 1 })).status, 400, 'confirmation required');
    assert.equal((await post(owner, { mode: 'replace', confirm: true, document: doc, expectedVersion: 0 })).status, 409, 'stale preview rejected');
    const ok = await post(owner, { mode: 'replace', confirm: true, document: doc, expectedVersion: 1 });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).version, 2);
    const after = await load(owner);
    assert.equal(after.version, 2);
    assert.equal(after.state.courses[0].code, 'CS111');
    assert.equal((await load(other)).version, 1, 'other users are untouched');
    assert.equal((await post(owner, { mode: 'replace', confirm: true, document: doc, expectedVersion: 1 })).status, 409, 'replaying an old preview cannot overwrite newer data');
});

test('import maps data to the session user and drops IDs, tokens and unknown fields from the file', async () => {
    const victim = await ctx.addUser(), attacker = await ctx.addUser();
    const doc = exportDoc({ ...fullState(), userId: victim.id, refreshToken: 'secret-token', googleConnections: [{ refresh_token: 'x' }] }, { userId: victim.id, user_id: victim.id });
    doc.state.profile = { ...profile, userId: victim.id, accessToken: 'abc' };
    const res = await post(attacker, { mode: 'replace', confirm: true, document: doc, expectedVersion: 0 });
    assert.equal(res.status, 200);
    const rows = await ctx.client.query('select user_id, payload::text as payload from student_states where user_id in ($1, $2)', [victim.id, attacker.id]);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].user_id, attacker.id);
    assert.doesNotMatch(rows.rows[0].payload, /secret-token|accessToken|refreshToken|googleConnections|userId|user_id/);
});

test('import rejects wrong formats, unsupported versions, invalid state, oversize files and cross-origin posts', async () => {
    const u = await ctx.addUser();
    const cases = [
        [{ hello: 'world' }, /not a CampusOS data export/],
        [exportDoc(fullState(), { schemaVersion: 9 }), /newer than this app supports/],
        [exportDoc(fullState(), { schemaVersion: 6 }), /not supported/],
        [exportDoc(fullState(), { schemaVersion: '7' }), /missing its schema version/],
        [exportDoc(null), /does not contain any student data/],
        [exportDoc(fullState({ courses: [{ ...course, start: '25:00' }] })), /failed validation \(at courses → 0 → start\)/],
        [exportDoc(fullState({ courses: [course, course] })), /Duplicate course IDs/],
    ];
    for (const [document, message] of cases) {
        const res = await post(u, { mode: 'preview', document });
        assert.equal(res.status, 422, String(message));
        assert.match((await res.json()).error, message);
    }
    assert.equal((await post(u, '{not json')).status, 400);
    assert.equal((await post(u, JSON.stringify({ mode: 'preview', document: { pad: 'x'.repeat(3_100_000) } }))).status, 413);
    assert.equal((await post(u, { mode: 'preview', document: exportDoc(fullState()) }, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await post(u, { mode: 'delete', document: exportDoc(fullState()) })).status, 400);
    assert.equal((await load(u)).version, 0, 'nothing was written');
});

test('import pauses a running Pomodoro at export time instead of counting time since export', async () => {
    const u = await ctx.addUser();
    const study = { ...defaultStudy(), timer: { id: '0f6c2f6e-3a59-4c39-a6f6-5b0c6d3e9a10', courseCode: 'CS111', kind: 'focus', duration: 1500, remaining: 1500, startedAt: '2026-10-14T11:50:00.000Z' } };
    const doc = exportDoc(fullState({ study }));
    const res = await post(u, { mode: 'replace', confirm: true, document: doc, expectedVersion: 0 });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.match(body.warnings[0], /imported paused/);
    const { state } = await load(u);
    assert.equal(state.study.timer.startedAt, null);
    assert.equal(state.study.timer.remaining, 900, 'only the 10 minutes before export count');
    assert.equal(state.study.sessions.length, 0, 'no session is logged automatically');
});

test('safe redirect helper only allows same-site relative paths', () => {
    assert.equal(safeNextPath('/'), '/');
    assert.equal(safeNextPath('/update-password'), '/update-password');
    assert.equal(safeNextPath('/?calendar=connected#x'), '/?calendar=connected#x');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '\\\\evil', 'javascript:alert(1)', '/%0d%0aSet-Cookie:x', ' /x', '/login', '/auth/callback', '/api/state', '', null, undefined, '/\tevil', 'evil'])
        assert.equal(safeNextPath(bad), bad === '/%0d%0aSet-Cookie:x' ? '/%0d%0aSet-Cookie:x' : '/', String(bad));
});

test('APP_ORIGIN and token-key validation', () => {
    assert.equal(appOrigin({ APP_ORIGIN: 'https://campusos.example.com' }), 'https://campusos.example.com');
    assert.equal(appOrigin({ APP_ORIGIN: 'https://campusos.example.com/' }), 'https://campusos.example.com');
    assert.equal(appOrigin({ APP_ORIGIN: 'http://localhost:3000' }), 'http://localhost:3000');
    for (const bad of ['http://campusos.example.com', 'https://campusos.example.com/app', 'https://user:pw@x.com', 'https://x.com?a=1', 'not a url', ''])
        assert.equal(appOrigin({ APP_ORIGIN: bad }), null, bad);
    assert.equal(tokenKey({ TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }) !== null, true);
    assert.equal(tokenKey({ TOKEN_ENCRYPTION_KEY: Buffer.alloc(16, 7).toString('base64') }), null);
    assert.equal(tokenKey({ TOKEN_ENCRYPTION_KEY: 'short' }), null);
    const missing = googleConfig({});
    assert.equal(missing.ready, false);
    assert.deepEqual(missing.missing, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY', 'APP_ORIGIN']);
});

const GOOGLE_ENV = { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-secret', TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), APP_ORIGIN: ORIGIN };
function withEnv(values, fn) {
    const saved = Object.fromEntries(Object.keys({ ...GOOGLE_ENV, OPENAI_API_KEY: '' }).map(k => [k, process.env[k]]));
    for (const k of Object.keys(saved)) delete process.env[k];
    Object.assign(process.env, values);
    return Promise.resolve(fn()).finally(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

test('missing optional integrations keep the core app working', () => withEnv({}, async () => {
    const u = await ctx.addUser();
    await save(u, fullState(), 0);
    let upstream = 0;
    const d = deps(ctx.db, u, { fetch: async () => { upstream++; throw Error('unexpected'); } });
    const status = await (await googleRoutes(d).status(request('/api/google/status'))).json();
    assert.equal(status.configured, false);
    assert.equal(status.connected, false);
    assert.deepEqual(status.missing, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY', 'APP_ORIGIN']);
    const form = new FormData();
    form.set('consent', 'yes');
    assert.equal((await googleRoutes(d).oauthStart(request('/api/google/oauth/start', { method: 'POST', body: form }))).status, 503);
    assert.equal((await (await parseRoutes(d).GET()).json()).aiAvailable, false);
    const parsed = await parseRoutes(d).POST(request('/api/parse', { method: 'POST', body: { kind: 'syllabus', text: 'Midterm exam on October 5, 2026 (20%)' } }));
    const result = await parsed.json();
    assert.equal(parsed.status, 200);
    assert.equal(result.mode, 'basic');
    assert.match(result.warnings[0], /AI parsing is not connected/);
    assert.equal(upstream, 0);
    assert.equal((await calendarRoutes(d).GET(request('/api/calendar?classes=1'))).status, 200);
}));

test('AI parsing is metered durably per user and falls back to basic extraction at the limit', () => withEnv({ OPENAI_API_KEY: 'sk-test' }, async () => {
    const u = await ctx.addUser(), other = await ctx.addUser();
    const t = Date.parse('2026-10-14T12:00:00Z');
    for (let i = 0; i < AI_CALLS_PER_HOUR; i++) assert.equal(await consumeAiQuota(ctx.db, u.id, t + i), true);
    assert.equal(await consumeAiQuota(ctx.db, u.id, t + 100), false);
    assert.equal(await consumeAiQuota(ctx.db, other.id, t + 100), true, 'limits are per user');
    assert.equal(await consumeAiQuota(ctx.db, u.id, t + 3_600_001), true, 'window resets after an hour');
    await save(u, fullState(), 0);
    for (let i = 0; i < AI_CALLS_PER_HOUR; i++) await consumeAiQuota(ctx.db, u.id, t + 3_600_002);
    let upstream = 0;
    const d = deps(ctx.db, u, { now: () => t + 3_600_003, fetch: async () => { upstream++; return new Response('{}', { status: 500 }); } });
    const res = await (await parseRoutes(d).POST(request('/api/parse', { method: 'POST', body: { kind: 'syllabus', text: 'Final exam December 15, 2026' } }))).json();
    assert.equal(res.mode, 'basic');
    assert.match(res.warnings[0], /hourly AI parsing limit/);
    assert.equal(upstream, 0, 'no paid call once the limit is reached');
}));

test('upstream AI failure falls back to basic extraction without leaking details', () => withEnv({ OPENAI_API_KEY: 'sk-test' }, async () => {
    const u = await ctx.addUser();
    await save(u, fullState(), 0);
    let auth = '';
    const d = deps(ctx.db, u, { fetch: async (_url, init) => { auth = init.headers.Authorization; return new Response('upstream exploded', { status: 502 }); } });
    const res = await (await parseRoutes(d).POST(request('/api/parse', { method: 'POST', body: { kind: 'quickadd', text: 'CS111 homework due tomorrow' } }))).json();
    assert.equal(auth, 'Bearer sk-test');
    assert.equal(res.mode, 'basic');
    assert.match(res.warnings[0], /AI parsing was unavailable/);
    assert.doesNotMatch(JSON.stringify(res), /exploded|sk-test/);
}));

test('Google OAuth start uses APP_ORIGIN, PKCE, hashed state and secure cookies; callback validates state, owner and origin', () => withEnv(GOOGLE_ENV, async () => {
    const a = await ctx.addUser(), b = await ctx.addUser();
    await save(a, fullState(), 0);
    await save(b, fullState(), 0);
    const calls = [];
    const fakeGoogle = async (url, init) => {
        calls.push(String(url));
        if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
            assert.equal(init.body.get('redirect_uri'), ORIGIN + '/api/google/oauth/callback');
            assert.ok(init.body.get('code_verifier'));
            return Response.json({ access_token: 'at', refresh_token: 'rt-plaintext-secret', scope: 'openid email https://www.googleapis.com/auth/calendar.app.created' });
        }
        return Response.json({ sub: 'google-sub-1', email: 'student@gmail.com' });
    };
    const ga = googleRoutes(deps(ctx.db, a, { fetch: fakeGoogle })), gb = googleRoutes(deps(ctx.db, b, { fetch: fakeGoogle }));
    const noConsent = await ga.oauthStart(request('/api/google/oauth/start', { method: 'POST', body: new FormData() }));
    assert.equal(noConsent.status, 400);
    const form = new FormData();
    form.set('consent', 'yes');
    const start = await ga.oauthStart(request('/api/google/oauth/start', { method: 'POST', body: form }));
    assert.equal(start.status, 303);
    const location = new URL(start.headers.get('location'));
    assert.equal(location.origin, 'https://accounts.google.com');
    assert.equal(location.searchParams.get('redirect_uri'), ORIGIN + '/api/google/oauth/callback');
    assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(location.searchParams.get('scope'), 'openid email https://www.googleapis.com/auth/calendar.app.created');
    const state = location.searchParams.get('state');
    const cookie = start.headers.get('set-cookie');
    assert.match(cookie, /^campusos_google_state=[\w-]+; HttpOnly; Secure; SameSite=Lax; Path=\/api\/google\/oauth; Max-Age=600$/);
    const stored = await ctx.client.query('select state_hash, verifier from google_oauth_attempts where user_id = $1', [a.id]);
    assert.equal(stored.rows.length, 1);
    assert.notEqual(stored.rows[0].state_hash, state, 'state is stored hashed');
    const cb = (routes, query, cookieValue = state, host = ORIGIN) => routes.oauthCallback(request('/api/google/oauth/callback?' + query, { origin: null, host, headers: { cookie: 'other=1; campusos_google_state=' + cookieValue } }));
    const loc = res => new URL(res.headers.get('location')).searchParams.get('calendar');
    assert.equal(loc(await cb(ga, `state=${state}&code=c`, 'wrong')), 'invalid_state', 'cookie must match');
    assert.equal(loc(await cb(gb, `state=${state}&code=c`)), 'invalid_state', 'another user cannot redeem the state');
    assert.equal(loc(await cb(ga, `state=${state}&code=c`, state, 'https://preview-abc.vercel.app')), 'invalid_state', 'non-canonical host is refused');
    assert.equal(calls.length, 0);
    const ok = await cb(ga, `state=${state}&code=c`);
    assert.equal(loc(ok), 'connected');
    assert.equal(new URL(ok.headers.get('location')).origin, ORIGIN);
    assert.match(ok.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal(loc(await cb(ga, `state=${state}&code=c`)), 'invalid_state', 'state is single-use');
    const conn = await ctx.client.query('select refresh_token, email, lock_id from google_connections where user_id = $1', [a.id]);
    assert.equal(conn.rows[0].email, 'student@gmail.com');
    assert.doesNotMatch(conn.rows[0].refresh_token, /rt-plaintext-secret/, 'refresh token is encrypted at rest');
    assert.equal(conn.rows[0].lock_id, null, 'lock released');
    const statusB = await (await gb.status(request('/api/google/status'))).json();
    assert.equal(statusB.connected, false, 'connection belongs only to user A');
    const preview = await (await ga.status(request('/api/google/status', { host: 'https://preview-abc.vercel.app', origin: 'https://preview-abc.vercel.app' }))).json();
    assert.equal(preview.configured, false);
    assert.equal(preview.canonicalOrigin, ORIGIN);
    const startOnPreview = await ga.oauthStart(request('/api/google/oauth/start', { method: 'POST', body: form, host: 'https://preview-abc.vercel.app', origin: 'https://preview-abc.vercel.app' }));
    assert.equal(startOnPreview.status, 503);
    const disconnected = await ga.disconnect(request('/api/google/disconnect', { method: 'POST', body: { confirm: true } }));
    assert.equal(disconnected.status, 200);
    assert.equal((await ctx.client.query('select refresh_token from google_connections where user_id = $1', [a.id])).rows[0].refresh_token, null);
}));

test('localhost development uses non-Secure state cookies only for http://localhost', () => withEnv({ ...GOOGLE_ENV, APP_ORIGIN: 'http://localhost:3000' }, async () => {
    const u = await ctx.addUser();
    await save(u, fullState(), 0);
    const form = new FormData();
    form.set('consent', 'yes');
    const res = await googleRoutes(deps(ctx.db, u)).oauthStart(request('/api/google/oauth/start', { method: 'POST', body: form, host: 'http://localhost:3000', origin: 'http://localhost:3000' }));
    assert.equal(res.status, 303);
    assert.doesNotMatch(res.headers.get('set-cookie'), /Secure/);
    assert.equal(new URL(res.headers.get('location')).searchParams.get('redirect_uri'), 'http://localhost:3000/api/google/oauth/callback');
}));

test('sync locks and single-use plans are enforced per user in Postgres', () => withEnv(GOOGLE_ENV, async () => {
    const { lock, unlock } = await import('../lib/google-server.ts');
    const u = await ctx.addUser(), other = await ctx.addUser();
    const id = await lock(ctx.db, u.id);
    await assert.rejects(lock(ctx.db, u.id), /Another calendar action is running/);
    const otherId = await lock(ctx.db, other.id);
    await unlock(ctx.db, other.id, otherId);
    await unlock(ctx.db, u.id, 'not-the-lock');
    await assert.rejects(lock(ctx.db, u.id), /Another calendar action/, 'only the holder can unlock');
    await unlock(ctx.db, u.id, id);
    await unlock(ctx.db, u.id, await lock(ctx.db, u.id));
    await save(u, fullState(), 0);
    await ctx.client.query(`insert into google_sync_plans (id, user_id, payload, expires) values ('plan-1', $1, '{}'::jsonb, $2)`, [u.id, Date.now() + 60000]);
    const res = await googleRoutes(deps(ctx.db, other)).sync(request('/api/google/sync', { method: 'POST', body: { planId: 'plan-1', confirm: true } }));
    assert.equal(res.status, 409, 'another user cannot redeem plan-1');
    assert.match((await res.json()).error, /expired or was already used/);
    assert.equal((await ctx.client.query(`select used from google_sync_plans where id = 'plan-1'`)).rows[0].used, false);
}));

test('Supabase Data API roles cannot read or write CampusOS tables (RLS on, grants revoked)', async () => {
    const tables = ['student_states', 'google_connections', 'google_oauth_attempts', 'google_sync_plans', 'ai_parse_usage'];
    const rls = await ctx.client.query(`select relname, relrowsecurity from pg_class where relname = any($1)`, [tables]);
    assert.equal(rls.rows.length, tables.length);
    for (const row of rls.rows) assert.equal(row.relrowsecurity, true, row.relname);
    for (const role of ['anon', 'authenticated']) {
        for (const table of tables) {
            await ctx.client.query(`set role ${role}`);
            try {
                await assert.rejects(ctx.client.query(`select * from public.${table}`), /permission denied/, `${role} select ${table}`);
                await assert.rejects(ctx.client.query(`delete from public.${table}`), /permission denied/, `${role} delete ${table}`);
            } finally {
                await ctx.client.query('reset role');
            }
        }
    }
});

test('deleting a Supabase user cascades to their CampusOS rows', async () => {
    const u = await ctx.addUser();
    await save(u, fullState(), 0);
    await ctx.client.query('delete from auth.users where id = $1', [u.id]);
    assert.equal((await ctx.client.query('select 1 from student_states where user_id = $1', [u.id])).rows.length, 0);
});
