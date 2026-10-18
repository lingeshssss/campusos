import { Capacitor } from '@capacitor/core';

// The same bundle runs on iPhone and Android; platform differences are decided here.
export const isAndroid = Capacitor.getPlatform() === 'android';
export const platformKind: 'ios' | 'android' = isAndroid ? 'android' : 'ios';
/** How on-screen text names this device. */
export const deviceName = isAndroid ? 'phone' : 'iPhone';
/** Where to turn CampusOS notifications back on. */
export const notificationSettingsHint = isAndroid
    ? 'Turn them on in Settings → Apps → CampusOS → Notifications.'
    : 'Turn them on in the iOS Settings app → CampusOS → Notifications.';
