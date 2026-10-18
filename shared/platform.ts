import type { State } from '../lib/model.ts';
import { forgetAccountTheme } from '../lib/theme/runtime.ts';

// Everything the shared CampusOS UI needs from its host. The website (Next.js) uses relative URLs and
// cookie sessions; the iOS app (Capacitor) uses bearer tokens, an offline cache and native sharing.

export class SessionExpiredError extends Error {
    constructor(message = 'Your session has ended. Sign in again to continue.') {
        super(message);
    }
}
export class ConflictError extends Error {}
export class OfflineError extends Error {
    constructor(message = 'You’re offline. This needs an internet connection.') {
        super(message);
    }
}

export type Loaded = { state: State; version: number };
export type Saved = { version: number; queued?: boolean };

export interface StateStore {
    load(): Promise<Loaded>;
    /** Throws ConflictError when the server has newer data, SessionExpiredError when signed out. */
    save(next: State, version: number): Promise<Saved>;
    /** Notifies the UI when state is replaced outside a save (offline sync, conflict resolution). */
    subscribe?(listener: (loaded: Loaded) => void): () => void;
}

export interface Platform {
    kind: 'web' | 'ios' | 'android';
    /** How on-screen text names this device in the apps ("iPhone", "phone"); absent on the web. */
    deviceName?: string;
    /** Calls a CampusOS API route with this platform's authentication. */
    api(path: string, init?: RequestInit): Promise<Response>;
    state: StateStore;
    /** Downloads (web) or shares (apps) an authenticated API response as a file. */
    downloadApi(path: string, filename: string): Promise<void>;
    /** Downloads (web) or shares (apps) generated content. */
    saveFile(filename: string, content: string | Blob, type: string): Promise<void>;
    openExternal(url: string): void;
    signOut(): Promise<void>;
    changePassword(): void;
    /**
     * Permanently deletes the account after the UI has collected explicit confirmation. Password accounts pass
     * `email` and `password`: the platform signs in again first, because the server only deletes a password
     * account after a recent sign-in (reauthentication).
     */
    deleteAccount(reauth?: { email: string; password: string }): Promise<void>;
    sessionExpired(): void;
    /** Where the Google Calendar connection flow runs ('form' = in place, 'website' = opens the site). */
    calendarConnect: { mode: 'form' } | { mode: 'website'; open(): void };
    /** Called after every successful load/save so the host can update reminders or caches. */
    onState?(state: State): void;
}

async function readError(r: Response, fallback: string) {
    const data = await r.json().catch(() => ({})) as { error?: unknown; code?: unknown };
    if (r.status === 401) throw new SessionExpiredError(typeof data.error === 'string' ? data.error : undefined);
    if (r.status === 409) throw new ConflictError(typeof data.error === 'string' ? data.error : 'Your data changed elsewhere. Reload before editing.');
    throw Error(typeof data.error === 'string' ? data.error : fallback);
}

/** State store over any `api` function: GET/PUT /api/state with optimistic version checks. */
export function apiStateStore(api: Platform['api']): StateStore {
    return {
        async load() {
            const r = await api('/api/state');
            if (!r.ok) await readError(r, 'Unable to load your data. Please retry.');
            return await r.json() as Loaded;
        },
        async save(next, version) {
            const r = await api('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: next, version }) });
            if (!r.ok) await readError(r, 'Unable to save');
            return await r.json() as Saved;
        },
    };
}

function webDownload(href: string, filename: string, revoke = false) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) setTimeout(() => URL.revokeObjectURL(href), 10000);
}

const webApi: Platform['api'] = (path, init) => fetch(path, { credentials: 'same-origin', ...init });

export const webPlatform: Platform = {
    kind: 'web',
    api: webApi,
    state: apiStateStore(webApi),
    async downloadApi(path, filename) {
        webDownload(path, filename);
    },
    async saveFile(filename, content, type) {
        const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
        webDownload(URL.createObjectURL(blob), filename, true);
    },
    openExternal(url) {
        window.open(url, '_blank', 'noopener,noreferrer');
    },
    async signOut() {
        forgetAccountTheme(); // the next person to sign in on this browser must not see this school's colors
        // A real form POST so the server clears the httpOnly session cookies and redirects.
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/auth/signout';
        document.body.appendChild(form);
        form.submit();
    },
    changePassword() {
        window.location.href = '/update-password';
    },
    async deleteAccount(reauth) {
        if (reauth) {
            // Loaded only here so the app bundles never include the website's cookie-session client.
            const { createSupabaseBrowserClient } = await import('../lib/supabase/client');
            const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email: reauth.email, password: reauth.password });
            if (error) throw Error('That password isn’t right. Nothing was deleted.');
        }
        const r = await webApi('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) });
        if (!r.ok) await readError(r, 'Your account could not be deleted. Your CampusOS data is still there; please retry.');
        forgetAccountTheme();
        // Clear the session cookies on the server, then land on the sign-in page with a confirmation.
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/auth/signout?reason=account_deleted';
        document.body.appendChild(form);
        form.submit();
    },
    sessionExpired() {
        forgetAccountTheme();
        window.location.href = '/login?error=session_expired';
    },
    calendarConnect: { mode: 'form' },
};

let current: Platform = webPlatform;

export function setPlatform(platform: Platform) {
    current = platform;
}
export function platform(): Platform {
    return current;
}
export const api: Platform['api'] = (path, init) => current.api(path, init);
