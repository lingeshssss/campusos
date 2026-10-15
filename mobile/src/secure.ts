import { Capacitor } from '@capacitor/core';
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Preferences } from '@capacitor/preferences';

// iOS Keychain storage for the Supabase session and the local-data encryption key.
// This-device-only, readable only while unlocked, never synced through iCloud Keychain.
let ready: Promise<void> | null = null;
function init() {
    ready ??= (async () => {
        if (!Capacitor.isNativePlatform()) throw Error('Secure storage requires the CampusOS iOS app.');
        await SecureStorage.setKeyPrefix('campusos.');
        await SecureStorage.setSynchronize(false);
        await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
    })();
    return ready;
}

export const keychain = {
    async getItem(key: string): Promise<string | null> {
        await init();
        return SecureStorage.getItem(key);
    },
    async setItem(key: string, value: string): Promise<void> {
        await init();
        await SecureStorage.setItem(key, value);
    },
    async removeItem(key: string): Promise<void> {
        await init();
        await SecureStorage.removeItem(key);
    },
    /** Removes every CampusOS Keychain item (session, data key). */
    async clear(): Promise<void> {
        await init();
        await SecureStorage.clear();
    },
};

/**
 * iOS keeps Keychain items after an app is deleted, but removes its preferences. On the first launch of a
 * fresh install, erase any Keychain items left by a previous install so nobody is signed in unexpectedly.
 */
export async function clearKeychainAfterReinstall() {
    const { value } = await Preferences.get({ key: 'install-marker' });
    if (value) return;
    await keychain.clear().catch(() => undefined);
    await Preferences.set({ key: 'install-marker', value: new Date().toISOString() });
}
