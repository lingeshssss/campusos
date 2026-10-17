import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

// The iOS app runs its own bundled build (mobile/dist). There is deliberately no `server.url`: the app
// never loads the website remotely; it only calls the CampusOS API with a bearer token.
const config: CapacitorConfig = {
    // Must match the App ID registered in your Apple Developer account and IOS_BUNDLE_ID on the server.
    appId: 'com.lingeshsashikumar.campusos',
    appName: 'CampusOS',
    webDir: 'mobile/dist',
    // Bridge logs include values read from the Keychain (session token, data key). Never log them.
    loggingBehavior: 'none',
    ios: {
        contentInset: 'never',
        // Matches the page background, so there is no white frame between the splash screen and the app.
        backgroundColor: '#f7f8f4',
    },
    plugins: {
        Keyboard: { resize: KeyboardResize.Native, resizeOnFullScreen: true },
        LocalNotifications: { presentationOptions: ['banner', 'list', 'sound'] },
        StatusBar: { overlaysWebView: true },
    },
};

export default config;
