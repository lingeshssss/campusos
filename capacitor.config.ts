import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

// The iPhone and Android apps run the same bundled build (mobile/dist). There is deliberately no
// `server.url`: the apps never load the website remotely; they only call the CampusOS API with a bearer token.
const config: CapacitorConfig = {
    // iOS bundle ID and Android applicationId. Must match the App ID in your Apple Developer account
    // (IOS_BUNDLE_ID on the server) and the Google Play app (ANDROID_PACKAGE_NAME on the server).
    // It can never change after the first App Store / Play upload.
    appId: 'com.lingeshsashikumar.campusos',
    appName: 'CampusOS',
    webDir: 'mobile/dist',
    // Bridge logs include values read from secure storage (session token, data key). Never log them.
    loggingBehavior: 'none',
    ios: {
        contentInset: 'never',
        // The native background follows light/dark mode in CampusViewController.swift (a fixed color here would
        // flash light behind the dark theme).
    },
    android: {
        // Bundled content is served from https://localhost; the API is HTTPS. No http:// content, ever.
        allowMixedContent: false,
        // The native background follows light/dark mode (res/values*/colors.xml, MainActivity.java).
    },
    plugins: {
        Keyboard: { resize: KeyboardResize.Native, resizeOnFullScreen: true },
        LocalNotifications: { presentationOptions: ['banner', 'list', 'sound'], smallIcon: 'ic_stat_campusos', iconColor: '#1f5143' },
        StatusBar: { overlaysWebView: true },
        // Android 15+ draws edge-to-edge. 'native' keeps env(safe-area-inset-*) correct on every WebView version
        // (older WebViews are padded instead), which is what app/globals.css and mobile.css use.
        SystemBars: { insetsHandling: 'native' },
    },
};

export default config;
