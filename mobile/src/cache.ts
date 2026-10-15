import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { keychain } from './secure';
import { newBoxKey, openText, sealText } from '../../lib/crypto-box';
import type { Snapshot } from '../../lib/offline-sync';

// Last synced copy + queued offline edits, AES-GCM encrypted with a Keychain-held key, in a folder
// excluded from iCloud backup. Bound to the user ID so another account can never read it.
const FILE = 'campusos-state.sealed';
const KEY = 'data-key';
const where = { path: FILE, directory: Directory.LibraryNoCloud };

async function dataKey(create: boolean) {
    let key = await keychain.getItem(KEY);
    if (!key && create) {
        key = newBoxKey();
        await keychain.setItem(KEY, key);
    }
    return key;
}

export function encryptedCache(userId: string) {
    return {
        async read(): Promise<Snapshot | null> {
            const key = await dataKey(false);
            if (!key) return null;
            try {
                const file = await Filesystem.readFile({ ...where, encoding: Encoding.UTF8 });
                const snapshot = JSON.parse(await openText(String(file.data), key, userId)) as Snapshot;
                return snapshot.userId === userId ? snapshot : null;
            } catch {
                return null;
            }
        },
        async write(snapshot: Snapshot) {
            const key = await dataKey(true);
            await Filesystem.writeFile({ ...where, data: await sealText(JSON.stringify(snapshot), key!, userId), encoding: Encoding.UTF8, recursive: true });
        },
    };
}

/** Erases the local copy and its key. Used on sign-out and account deletion. */
export async function eraseLocalData() {
    await Filesystem.deleteFile(where).catch(() => undefined);
    await Filesystem.rmdir({ path: 'exports', directory: Directory.Cache, recursive: true }).catch(() => undefined);
    await keychain.removeItem(KEY).catch(() => undefined);
}
