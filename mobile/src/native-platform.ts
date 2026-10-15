import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Network } from '@capacitor/network';
import { Share } from '@capacitor/share';
import { config } from './config';
import { accessToken, supabase } from './supabase';
import { keychain } from './secure';
import { encryptedCache, eraseLocalData } from './cache';
import { clearReminders, syncReminders } from './notifications';
import { appleSignIn, isAppleCancel } from './apple';
import { apiStateStore, OfflineError, SessionExpiredError, type Platform } from '../../shared/platform';
import { createOfflineStore, type OfflineStore } from '../../lib/offline-sync';

export type SignedOutReason = 'signed_out' | 'account_deleted' | 'session_expired';

/** Calls the CampusOS API on the Vercel origin with the Supabase access token. */
export async function nativeApi(path: string, init: RequestInit = {}): Promise<Response> {
    if (!(await Network.getStatus()).connected) throw new OfflineError();
    const token = await accessToken();
    if (!token) throw new SessionExpiredError();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    try {
        return await fetch(config.apiOrigin + path, { ...init, headers, credentials: 'omit' });
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        throw new OfflineError('CampusOS couldn’t be reached. Check your connection and try again.');
    }
}

/** Removes every trace of the signed-in user from this iPhone. */
export async function wipeDevice() {
    await clearReminders().catch(() => undefined);
    await eraseLocalData().catch(() => undefined);
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    await keychain.clear().catch(() => undefined);
}

async function shareFile(filename: string, text: string) {
    const safe = filename.replace(/[^\w.-]+/g, '-');
    const { uri } = await Filesystem.writeFile({ path: `exports/${safe}`, directory: Directory.Cache, data: text, encoding: Encoding.UTF8, recursive: true });
    try {
        await Share.share({ title: safe, files: [uri] });
    } catch (e) {
        if (!(e instanceof Error && /cancel/i.test(e.message))) throw e;
    }
}

export function createNativePlatform(options: { userId: string; providers: string[]; onSignedOut(reason: SignedOutReason, message?: string): void; onChangePassword(): void }): { platform: Platform; store: OfflineStore; dispose(): void } {
    const store = createOfflineStore({ userId: options.userId, remote: apiStateStore(nativeApi), cache: encryptedCache(options.userId) });
    const listeners = [
        Network.addListener('networkStatusChange', status => { if (status.connected) void store.sync(); }),
        App.addListener('resume', () => { void store.sync(); }),
    ];
    const dispose = () => listeners.forEach(l => void l.then(h => h.remove()));

    const platform: Platform = {
        kind: 'ios',
        api: nativeApi,
        state: store,
        async downloadApi(path, filename) {
            const r = await nativeApi(path);
            if (!r.ok) {
                const data = await r.json().catch(() => ({})) as { error?: string };
                throw Error(data.error ?? 'The file could not be prepared.');
            }
            await shareFile(filename, await r.text());
        },
        async saveFile(filename, content) {
            await shareFile(filename, typeof content === 'string' ? content : await content.text());
        },
        openExternal(url) {
            void Browser.open({ url });
        },
        async signOut() {
            await wipeDevice();
            options.onSignedOut('signed_out');
        },
        changePassword() {
            options.onChangePassword();
        },
        async deleteAccount() {
            let appleAuthorizationCode: string | undefined;
            if (options.providers.includes('apple') && config.apple) {
                // Apple requires revoking Sign in with Apple tokens on deletion; a fresh confirmation provides the code.
                try {
                    appleAuthorizationCode = (await appleSignIn()).authorizationCode;
                } catch (e) {
                    if (isAppleCancel(e)) throw Error('Account deletion was cancelled. Confirm with Apple to continue.');
                    throw e;
                }
            }
            const r = await nativeApi('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE', appleAuthorizationCode }) });
            const data = await r.json().catch(() => ({})) as { error?: string; apple?: string };
            if (!r.ok) throw Error(data.error ?? 'Your account could not be deleted. Your CampusOS data is still there; please retry.');
            await wipeDevice();
            options.onSignedOut('account_deleted', data.apple && !['revoked', 'not_apple'].includes(data.apple) ? 'To finish, open Settings → your name → Sign-In & Security → Sign in with Apple, choose CampusOS and stop using your Apple ID with it.' : undefined);
        },
        sessionExpired() {
            // Not a deliberate sign-out: keep the encrypted copy (and any unsynced edits) for the same account.
            void supabase.auth.signOut({ scope: 'local' }).finally(() => options.onSignedOut('session_expired'));
        },
        calendarConnect: { mode: 'website', open: () => { void Browser.open({ url: `${config.apiOrigin}/?view=calendar` }); } },
        onState(state) {
            void syncReminders(state);
        },
    };
    return { platform, store, dispose };
}
