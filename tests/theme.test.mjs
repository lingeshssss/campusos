import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { testDb, request, deps, profile, course } from './helpers/db.mjs';
import { stateRoutes, importRoutes } from '../lib/server/routes/state.ts';
import { stateSchema } from '../lib/model.ts';
import { exportDocument, prepareImport, EXPORT_SCHEMA_VERSION } from '../lib/student-data.ts';
import { defaultStudy } from '../lib/study.ts';
import { defaultPlanner } from '../lib/planner.ts';
import { contrast, ensureContrast, toOklch } from '../lib/theme/color.ts';
import { UNIVERSITY_BRANDING, VERIFIED_BRANDING_COUNT, brandingFor, brandingIndex, brandingProblems, canonicalDomain } from '../lib/theme/branding.ts';
import { ACCENT_TOKENS, CAMPUSOS_PALETTE, accentSelection, derivePalette } from '../lib/theme/palette.ts';
import { CONTRAST_PAIRS, NEUTRALS } from '../lib/theme/tokens.ts';
import { paletteProperties, themeCss } from '../lib/theme/css.ts';
import { defaultPreferences, preferencesSchema, withChange } from '../lib/theme/preferences.ts';
import { THEME_STORAGE_KEY, applyTheme, forgetAccountTheme, readThemeCache, resolveMode, writeThemeCache } from '../lib/theme/runtime.ts';
import { BOOT_SCRIPT } from '../lib/theme/boot.ts';

const universities = JSON.parse(readFileSync(new URL('../lib/universities.json', import.meta.url), 'utf8'));

// ---------- helpers: a minimal <html> element and storage, enough for runtime.ts and the boot script

function fakeRoot() {
    const attrs = new Map(), props = new Map();
    const style = new Proxy({
        setProperty: (n, v) => props.set(n, v),
        removeProperty: n => props.delete(n),
    }, { get: (t, k) => k in t ? t[k] : k === 'length' ? props.size : /^\d+$/.test(String(k)) ? [...props.keys()][Number(k)] : undefined });
    return { attrs, props, style, setAttribute: (n, v) => attrs.set(n, String(v)), getAttribute: n => attrs.has(n) ? attrs.get(n) : null, removeAttribute: n => attrs.delete(n) };
}
function fakeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return { m, getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
/** Runs the real boot script against a fake document; returns the root and the window it installed. */
function boot({ cache = null, path = '/', dark = false } = {}) {
    const root = fakeRoot(), store = fakeStorage(cache ? { [THEME_STORAGE_KEY]: JSON.stringify(cache) } : {});
    const listeners = [];
    const media = { matches: dark, addEventListener: (_e, f) => listeners.push(f) };
    const window = { matchMedia: () => media };
    vm.runInNewContext(BOOT_SCRIPT, { window, document: { documentElement: root }, localStorage: store, location: { pathname: path } });
    return { root, window, osChange(next) { media.matches = next; listeners.forEach(f => f()); } };
}

// ---------- preferences: defaults, persistence shape, backward compatibility

test('new and older accounts default to System appearance and University accent', () => {
    const legacy = stateSchema.parse({ profile: null, courses: [] });
    assert.deepEqual(legacy.preferences, defaultPreferences());
    assert.deepEqual(defaultPreferences(), { appearance: 'system', accent: 'university', updatedAt: null });
    // Unreadable values (hand-edited or from a future version) fall back instead of blocking the account.
    assert.deepEqual(stateSchema.parse({ profile: null, courses: [], preferences: { appearance: 'sepia', accent: 1 } }).preferences, defaultPreferences());
    const changed = withChange(defaultPreferences(), { appearance: 'dark' }, new Date('2026-10-17T12:00:00Z'));
    assert.deepEqual(changed, { appearance: 'dark', accent: 'university', updatedAt: '2026-10-17T12:00:00.000Z' });
    assert.equal(preferencesSchema.safeParse(changed).success, true);
});

test('device cache round-trips, rejects tampered values and survives storage failures', () => {
    const store = fakeStorage();
    writeThemeCache({ appearance: 'dark', uid: 'u1', accent: { '--al-accent': '#cc0033' } }, store);
    assert.deepEqual(readThemeCache(store), { appearance: 'dark', uid: 'u1', accent: { '--al-accent': '#cc0033' } });
    store.setItem(THEME_STORAGE_KEY, JSON.stringify({ appearance: 'neon', accent: { '--al-accent': 'red;background:url(x)', color: '#000000' } }));
    assert.deepEqual(readThemeCache(store), { appearance: 'system', uid: null, accent: null });
    store.setItem(THEME_STORAGE_KEY, '{not json');
    assert.equal(readThemeCache(store), null);
    const broken = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); }, removeItem() {} };
    assert.equal(readThemeCache(broken), null);
    assert.doesNotThrow(() => writeThemeCache({ appearance: 'light', uid: null, accent: null }, broken));
});

// ---------- system theme behavior

test('System follows the operating system; Light and Dark ignore it', () => {
    assert.equal(resolveMode('system', true), 'dark');
    assert.equal(resolveMode('system', false), 'light');
    assert.equal(resolveMode('light', true), 'light');
    assert.equal(resolveMode('dark', false), 'dark');
    const root = fakeRoot();
    applyTheme(root, { appearance: 'system', prefersDark: true, accent: null });
    assert.equal(root.getAttribute('data-theme'), 'dark');
    assert.equal(root.getAttribute('data-appearance'), 'system');
});

test('boot script paints the cached theme before React and tracks OS changes only for System', () => {
    const first = boot({ dark: true });
    assert.equal(first.root.getAttribute('data-theme'), 'dark', 'new visitors follow a dark OS on the first frame');
    first.osChange(false);
    assert.equal(first.root.getAttribute('data-theme'), 'light');

    const pinned = boot({ cache: { appearance: 'light', uid: null, accent: null }, dark: true });
    assert.equal(pinned.root.getAttribute('data-theme'), 'light');
    pinned.osChange(true);
    assert.equal(pinned.root.getAttribute('data-theme'), 'light', 'an explicit Light choice ignores the OS');

    // Parity with the React-side runtime for the same inputs.
    const accent = paletteProperties(accentSelection('university', 'rutgers.edu').palette);
    const booted = boot({ cache: { appearance: 'dark', uid: 'u1', accent } });
    const applied = fakeRoot();
    applyTheme(applied, { appearance: 'dark', prefersDark: false, accent, uid: 'u1' });
    assert.deepEqual([...booted.root.attrs].sort(), [...applied.attrs].sort());
    assert.deepEqual([...booted.root.props].sort(), [...applied.props].sort());
});

// ---------- university matching and fallback

test('every curated palette is valid, official-source linked and matches an exact dataset entry', () => {
    const byDomain = new Map(universities.map(u => [u.domain, u.name]));
    assert.equal(VERIFIED_BRANDING_COUNT, UNIVERSITY_BRANDING.length);
    assert.equal(new Set(UNIVERSITY_BRANDING.map(b => b.domain)).size, UNIVERSITY_BRANDING.length);
    for (const b of UNIVERSITY_BRANDING) {
        assert.deepEqual(brandingProblems(b), [], b.domain);
        assert.equal(byDomain.get(b.domain), b.name, `${b.domain} must be an exact dataset entry`);
        assert.ok(new URL(b.source).hostname.endsWith(b.domain === 'uw.edu' ? 'washington.edu' : b.domain === 'neu.edu' ? 'northeastern.edu' : b.domain), `${b.domain} source must be the institution's own site: ${b.source}`);
    }
    const rutgers = brandingFor('rutgers.edu');
    assert.equal(rutgers.primary.hex, '#CC0033');
    assert.equal(rutgers.name, 'Rutgers University');
});

test('matching is by exact canonical domain: no subdomain, parent-domain or name-based matches', () => {
    assert.equal(brandingFor(' WWW.Rutgers.EDU. ')?.domain, 'rutgers.edu');
    assert.equal(canonicalDomain('WWW.Rutgers.Edu'), 'rutgers.edu');
    // Campus subdomains in the dataset are distinct institutions.
    assert.ok(universities.some(u => u.domain === 'd.umn.edu'));
    assert.equal(brandingFor('d.umn.edu'), null);
    assert.equal(brandingFor('cs.rutgers.edu'), null);
    assert.equal(brandingFor('rutgers.edu.evil.com'), null);
    assert.equal(brandingFor('Rutgers University'), null, 'names never match');
    assert.equal(brandingFor('sc.edu'), null, 'University of South Carolina is not USC (usc.edu)');
    assert.equal(brandingFor(''), null);
    assert.equal(brandingFor(undefined), null);
});

test('every university in the dataset gets a working palette: verified colors or the labeled CampusOS fallback', () => {
    let verified = 0;
    for (const u of universities) {
        const s = accentSelection('university', u.domain);
        assert.ok(s.kind === 'university' || s.kind === 'fallback');
        if (s.kind === 'university') verified++; else assert.equal(s.palette, CAMPUSOS_PALETTE);
        if (s.kind === 'fallback') assert.equal(s.branding, null, 'fallback never claims official colors');
    }
    assert.equal(verified, UNIVERSITY_BRANDING.length);
    assert.equal(accentSelection('university', '').kind, 'campusos', 'before a school is chosen');
    assert.equal(accentSelection('campusos', 'rutgers.edu').kind, 'campusos', 'student chose the CampusOS default');
});

test('invalid or duplicate branding records are skipped with a warning instead of breaking themes', () => {
    const warnings = [];
    const index = brandingIndex([
        { domain: 'good.edu', name: 'Good', primary: { name: 'Blue', hex: '#123456' }, source: 'https://good.edu/brand', verified: '2026-10-17' },
        { domain: 'good.edu', name: 'Dupe', primary: { name: 'Red', hex: '#aa0000' }, source: 'https://good.edu/brand', verified: '2026-10-17' },
        { domain: 'Bad.EDU', name: 'Bad', primary: { name: 'Blue', hex: '#123456' }, source: 'https://bad.edu', verified: '2026-10-17' },
        { domain: 'nohex.edu', name: 'No hex', primary: { name: 'Blue', hex: 'blue' }, source: 'https://nohex.edu', verified: '2026-10-17' },
        { domain: 'http.edu', name: 'Insecure', primary: { name: 'Blue', hex: '#123456' }, source: 'http://http.edu', verified: '2026-10-17' },
        { domain: 'nodate.edu', name: 'No date', primary: { name: 'Blue', hex: '#123456' }, source: 'https://nodate.edu', verified: 'yesterday' },
        null,
    ], w => warnings.push(w));
    assert.deepEqual([...index.keys()], ['good.edu']);
    assert.equal(index.get('good.edu').name, 'Good');
    assert.equal(warnings.length, 6);
    assert.equal(brandingFor('bad.edu', index), null);
});

// ---------- accessible contrast for every palette

function tokens(palette, mode) { return { ...NEUTRALS[mode], ...palette[mode] }; }
function failures(palette) {
    const out = [];
    for (const mode of ['light', 'dark']) {
        const t = tokens(palette, mode);
        for (const { fg, bg, min } of CONTRAST_PAIRS) {
            const r = contrast(t[fg], t[bg]);
            if (r < min) out.push(`${mode}: ${fg} on ${bg} = ${r.toFixed(2)} (needs ${min})`);
        }
    }
    return out;
}

test('CampusOS and every verified school palette meet WCAG AA in light and dark mode', () => {
    assert.deepEqual(failures(CAMPUSOS_PALETTE), []);
    for (const b of UNIVERSITY_BRANDING) assert.deepEqual(failures(accentSelection('university', b.domain).palette), [], b.domain);
});

test('the generator stays accessible for extreme brand colors (white, black, yellow, neon, gray)', () => {
    for (const [p, s] of [['#ffffff', undefined], ['#000000', '#ffffff'], ['#ffff00', '#0000ff'], ['#00ff66', undefined], ['#808080', '#808080'], ['#ff00ff', '#00ffff'], ['#fdb515', '#002676']])
        assert.deepEqual(failures(derivePalette(p, s)), [], p);
});

test('label color on accents is chosen by contrast, not assumed white', () => {
    const gt = accentSelection('university', 'gatech.edu').palette, unc = accentSelection('university', 'unc.edu').palette;
    assert.equal(gt.dark['on-accent'], NEUTRALS.dark.ink, 'light gold in dark mode needs dark text');
    assert.equal(unc.dark['on-accent'], NEUTRALS.dark.ink);
    assert.equal(accentSelection('university', 'rutgers.edu').palette.light['on-accent'], '#ffffff');
});

test('official colors are preserved where they already work and adapted only when needed', () => {
    const rutgers = accentSelection('university', 'rutgers.edu').palette;
    assert.equal(rutgers.light.accent, '#cc0033', 'Rutgers Red is used as-is in light mode');
    const psu = accentSelection('university', 'psu.edu').palette;
    assert.ok(toOklch(psu.dark.accent).l > toOklch('#001E44').l, 'Nittany Navy is lightened in dark mode');
    assert.ok(contrast(psu.dark['accent-text'], NEUTRALS.dark.surface) >= 4.5);
    // Hue is kept when adapting.
    assert.ok(Math.abs(toOklch(psu.dark['accent-text']).h - toOklch('#001E44').h) < 12);
    assert.equal(ensureContrast('#000000', ['#000000'], 21, 'darker'), null, 'impossible targets are reported, not faked');
});

test('semantic colors stay distinct from school accents (errors still look like errors)', () => {
    for (const mode of ['light', 'dark']) {
        const t = NEUTRALS[mode];
        assert.ok(toOklch(t['danger-text']).h < 45 || toOklch(t['danger-text']).h > 345, 'danger stays red');
        assert.ok(toOklch(t['success-text']).h > 100 && toOklch(t['success-text']).h < 160, 'success stays green');
        // Course colors remain four different hues regardless of the school palette.
        const hues = ['mint', 'blue', 'peach', 'purple'].map(c => Math.round(toOklch(t[`course-${c}-solid`]).h));
        for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) assert.ok(Math.abs(hues[i] - hues[j]) > 40, `${mode} course hues ${hues}`);
    }
    for (const t of ACCENT_TOKENS) assert.ok(!t.startsWith('danger') && !t.startsWith('course'), 'school palettes never override semantic or course tokens');
});

// ---------- switching universities and accounts

test('switching universities swaps the palette immediately; choosing CampusOS restores the default', () => {
    const root = fakeRoot();
    const apply = (accentMode, domain) => {
        const s = accentSelection(accentMode, domain);
        applyTheme(root, { appearance: 'light', prefersDark: false, accent: s.kind === 'university' ? paletteProperties(s.palette) : null, uid: 'u1' });
    };
    apply('university', 'rutgers.edu');
    assert.equal(root.props.get('--al-accent'), '#cc0033');
    apply('university', 'ucla.edu');
    assert.equal(root.props.get('--al-accent'), accentSelection('university', 'ucla.edu').palette.light.accent);
    apply('university', 'marywood.edu'); // in the dataset, no verified palette
    assert.equal(root.props.size, 0, 'fallback uses the CampusOS defaults from theme.css');
    apply('campusos', 'rutgers.edu');
    assert.equal(root.props.size, 0);
});

test('signing out and switching accounts never shows the previous student’s school colors', () => {
    const accent = paletteProperties(accentSelection('university', 'rutgers.edu').palette);
    const cache = { appearance: 'dark', uid: 'student-a', accent };

    // Auth pages ignore the cached palette but keep the device appearance (no light flash).
    const login = boot({ cache, path: '/login' });
    assert.equal(login.root.props.size, 0);
    assert.equal(login.root.getAttribute('data-theme'), 'dark');

    // Signed-in page for a different account drops student A's palette before rendering.
    const other = boot({ cache });
    assert.equal(other.root.props.get('--al-accent'), '#cc0033');
    other.window.__campusTheme.forUser('student-b');
    assert.equal(other.root.props.size, 0);
    const same = boot({ cache });
    same.window.__campusTheme.forUser('student-a');
    assert.equal(same.root.props.get('--al-accent'), '#cc0033', 'the same student keeps their palette');

    // Sign-out forgets the school palette and account, keeps the appearance.
    const store = fakeStorage({ [THEME_STORAGE_KEY]: JSON.stringify(cache) }), root = fakeRoot();
    applyTheme(root, { appearance: 'dark', prefersDark: false, accent, uid: 'student-a' });
    forgetAccountTheme(root, store);
    assert.deepEqual(readThemeCache(store), { appearance: 'dark', uid: null, accent: null });
    assert.equal(root.props.size, 0);
    assert.equal(root.getAttribute('data-accent-uid'), null);
    assert.equal(root.getAttribute('data-theme'), 'dark');
});

// ---------- backward-compatible saves, exports and imports (real Postgres)

let ctx;
before(async () => { ctx = await testDb(); });
const baseState = () => ({ profile, courses: [course], deadlines: [], grading: [], books: [], gradeCourses: [], planner: defaultPlanner(), study: defaultStudy() });
const put = (user, state, version) => stateRoutes(deps(ctx.db, user)).PUT(request('/api/state', { method: 'PUT', body: { state, version } }));
const get = async user => (await stateRoutes(deps(ctx.db, user)).GET()).json();

test('saving preferences changes only preferences; older clients that omit them cannot erase them', async () => {
    const user = await ctx.addUser();
    assert.equal((await put(user, baseState(), 0)).status, 200);
    let loaded = await get(user);
    assert.deepEqual(loaded.state.preferences, defaultPreferences());
    const prefs = { appearance: 'dark', accent: 'campusos', updatedAt: '2026-10-17T12:00:00.000Z' };
    assert.equal((await put(user, { ...loaded.state, preferences: prefs }, loaded.version)).status, 200);
    loaded = await get(user);
    assert.deepEqual(loaded.state.preferences, prefs);
    assert.deepEqual(loaded.state.courses, [course], 'other student data is untouched');
    // An installed older app build sends state without the preferences field.
    const legacy = { ...loaded.state };
    delete legacy.preferences;
    assert.equal((await put(user, { ...legacy, courses: [] }, loaded.version)).status, 200);
    loaded = await get(user);
    assert.deepEqual(loaded.state.preferences, prefs);
    assert.deepEqual(loaded.state.courses, []);
});

test('exports are schema v8 with preferences; v7 files still import and keep the account’s preferences', async () => {
    assert.equal(EXPORT_SCHEMA_VERSION, 8);
    const prefs = { appearance: 'light', accent: 'university', updatedAt: '2026-10-17T12:00:00.000Z' };
    const doc = exportDocument(stateSchema.parse({ ...baseState(), preferences: prefs }));
    assert.equal(doc.schemaVersion, 8);
    assert.deepEqual(doc.state.preferences, prefs);
    const v8 = prepareImport(JSON.parse(JSON.stringify(doc)));
    assert.equal(v8.ok, true);
    assert.equal(v8.keepsPreferences, true);
    assert.deepEqual(v8.state.preferences, prefs);
    const v7 = prepareImport({ format: 'campusos-student-data', schemaVersion: 7, exportedAt: '2026-10-01T00:00:00.000Z', state: baseState() });
    assert.equal(v7.ok, true);
    assert.equal(v7.keepsPreferences, false);

    // Import a v7 file into an account that chose Dark: Dark survives.
    const user = await ctx.addUser();
    const mine = { appearance: 'dark', accent: 'campusos', updatedAt: '2026-10-16T00:00:00.000Z' };
    await put(user, { ...baseState(), preferences: mine }, 0);
    const routes = importRoutes(deps(ctx.db, user));
    const document = { format: 'campusos-student-data', schemaVersion: 7, exportedAt: '2026-10-01T00:00:00.000Z', state: { ...baseState(), courses: [] } };
    const preview = await (await routes.POST(request('/api/import', { method: 'POST', body: { mode: 'preview', document } }))).json();
    const res = await routes.POST(request('/api/import', { method: 'POST', body: { mode: 'replace', confirm: true, expectedVersion: preview.current.version, document } }));
    assert.equal(res.status, 200);
    const loaded = await get(user);
    assert.deepEqual(loaded.state.preferences, mine);
    assert.deepEqual(loaded.state.courses, []);
});

// ---------- generated CSS and hardcoded colors

test('app/theme.css is up to date with lib/theme (run pnpm theme:css)', () => {
    assert.equal(readFileSync(new URL('../app/theme.css', import.meta.url), 'utf8'), themeCss());
});

test('stylesheets use semantic tokens instead of hardcoded colors', () => {
    for (const file of ['../app/globals.css', '../mobile/src/mobile.css']) {
        const css = readFileSync(new URL(file, import.meta.url), 'utf8');
        const found = css.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi) ?? [];
        assert.deepEqual(found, [], file);
    }
});
