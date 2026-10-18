import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { testDb, request, deps, profile, course } from './helpers/db.mjs';
import { stateRoutes } from '../lib/server/routes/state.ts';
import { accountRoutes, REAUTH_WINDOW_MS } from '../lib/server/routes/account.ts';
import { userFromClaims } from '../lib/server/identity.ts';
import { corsHeaders } from '../lib/server/cors.ts';
import { androidAssetLinks, mobileFallbackLink } from '../lib/server/app-links.ts';
import { defaultStudy } from '../lib/study.ts';

let ctx;
before(async () => { ctx = await testDb(); });
const baseState = () => ({ profile, courses: [course], deadlines: [], grading: [], books: [], gradeCourses: [], study: defaultStudy() });
const ANDROID = 'https://localhost';

test('CORS admits the Android app origin for /api only, never with credentials, and nothing similar', () => {
    const h = corsHeaders(ANDROID, '/api/state');
    assert.equal(h['Access-Control-Allow-Origin'], ANDROID);
    assert.equal(h['Access-Control-Allow-Credentials'], undefined, 'cookies are never accepted cross-origin');
    assert.equal(corsHeaders(ANDROID, '/login'), null);
    for (const near of ['http://localhost', 'https://localhost:8100', 'https://localhost.evil.example', 'https://www.campusos.dev.evil.example']) assert.equal(corsHeaders(near, '/api/state'), null, near);
});

test('Android app requests are authenticated only by the bearer token', async () => {
    const u = await ctx.addUser(), other = await ctx.addUser();
    const put = (user, headers) => stateRoutes(deps(ctx.db, user)).PUT(request('/api/state', { method: 'PUT', origin: ANDROID, headers, body: { state: baseState(), version: 0 } }));
    // The route trusts the verified token identity (injected here) and ignores any user ID in the body.
    assert.equal((await put(u, { authorization: 'Bearer a.b.c' })).status, 200);
    // Without a bearer token, a cookie-style request from the app origin fails the same-origin (CSRF) check.
    assert.equal((await put(other)).status, 403);
    assert.equal((await stateRoutes(deps(ctx.db, null)).GET()).status, 401);
});

test('assetlinks.json lists the package and only well-formed SHA-256 fingerprints', () => {
    const fp = 'AB:'.repeat(31) + 'CD';
    assert.equal(androidAssetLinks({}), null);
    assert.equal(androidAssetLinks({ ANDROID_PACKAGE_NAME: 'com.lingeshsashikumar.campusos' }), null, 'no fingerprints, no file');
    assert.equal(androidAssetLinks({ ANDROID_PACKAGE_NAME: 'not a package', ANDROID_SHA256_CERT_FINGERPRINTS: fp }), null);
    const links = androidAssetLinks({ ANDROID_PACKAGE_NAME: 'com.lingeshsashikumar.campusos', ANDROID_SHA256_CERT_FINGERPRINTS: ` ${fp.toLowerCase()} , junk, ${fp}, ${'12:'.repeat(31)}34` });
    assert.deepEqual(links, [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.lingeshsashikumar.campusos', sha256_cert_fingerprints: [fp, '12:'.repeat(31) + '34'] } }]);
});

test('the email-link fallback forwards only the code and safe parameters', () => {
    assert.equal(mobileFallbackLink({ code: 'abc', next: 'update-password', redirect: 'https://evil.example' }), 'campusos://auth/callback?code=abc&next=update-password');
    assert.equal(mobileFallbackLink({ next: 'https://evil.example' }), null);
});

test('sign-in time comes from the amr claim (refreshes keep it), not from iat', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const u = userFromClaims({ sub: 'u1', role: 'authenticated', exp, iat: exp - 60, amr: [{ method: 'password', timestamp: 1_800_000_000 }, { method: 'otp', timestamp: 1_700_000_000 }] });
    assert.equal(u.authenticatedAt, 1_800_000_000_000);
    assert.equal(userFromClaims({ sub: 'u1', role: 'authenticated', exp }).authenticatedAt, null);
});

test('password accounts must have signed in recently to delete; others are unaffected', async () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    const del = user => accountRoutes(deps(ctx.db, user, { now: () => now })).deleteAccount(request('/api/account/delete', { method: 'POST', origin: ANDROID, headers: { authorization: 'Bearer a.b.c' }, body: { confirm: 'DELETE' } }));
    const stale = { ...(await ctx.addUser()), providers: ['email'], authenticatedAt: now - REAUTH_WINDOW_MS - 1 };
    const res = await del(stale);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'reauthentication_required');
    assert.equal((await ctx.client.query('select 1 from auth.users where id = $1', [stale.id])).rows.length, 1, 'nothing deleted');
    assert.equal((await del({ ...stale, authenticatedAt: null })).status, 403);
    assert.equal((await del({ ...stale, authenticatedAt: now - 60_000 })).status, 200, 'fresh password sign-in');
    const google = { ...(await ctx.addUser()), providers: ['google'] };
    assert.equal((await del(google)).status, 200, 'Google-only accounts confirm by typing DELETE');
});

test('Android project: identifiers, SDK levels, permissions and release safety settings', () => {
    const root = new URL('../android/', import.meta.url);
    const read = p => readFileSync(new URL(p, root), 'utf8');
    const cap = readFileSync(new URL('../capacitor.config.ts', import.meta.url), 'utf8');
    const gradle = read('app/build.gradle'), vars = read('variables.gradle'), manifest = read('app/src/main/AndroidManifest.xml'), props = read('gradle.properties');
    const appId = /appId: '([^']+)'/.exec(cap)[1];
    assert.match(gradle, new RegExp(`applicationId "${appId.replaceAll('.', '\\.')}"`), 'applicationId matches the Capacitor appId');
    assert.match(gradle, new RegExp(`namespace = "${appId.replaceAll('.', '\\.')}"`));
    assert.equal(Number(/targetSdkVersion = (\d+)/.exec(vars)[1]) >= 36, true, 'Google Play requires API 36 for new apps and updates');
    assert.equal(Number(/compileSdkVersion = (\d+)/.exec(vars)[1]) >= 36, true);
    assert.match(props, /campusosVersionCode=\d+/);
    assert.doesNotMatch(cap, /server:\s*\{[^}]*url/, 'no remote server.url');
    assert.match(manifest, /android:allowBackup="false"/);
    assert.match(manifest, /android:usesCleartextTraffic="false"/);
    assert.match(manifest, /SCHEDULE_EXACT_ALARM" tools:node="remove"/);
    assert.doesNotMatch(manifest, /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|READ_MEDIA|CAMERA|ACCESS_FINE_LOCATION/);
    assert.match(manifest, /android:scheme="campusos" android:host="auth" android:path="\/callback"/);
    assert.match(manifest, /android:autoVerify="true"/);
    assert.match(read('app/src/main/res/xml/file_paths.xml'), /<cache-path name="exports" path="exports\/" \/>/);
    assert.doesNotMatch(read('app/src/main/res/xml/file_paths.xml'), /external-path|root-path/);
    assert.match(read('.gitignore'), /keystore\.properties/);
    assert.equal(existsSync(new URL('keystore.properties', root)) && !read('.gitignore').includes('keystore.properties'), false);
});
