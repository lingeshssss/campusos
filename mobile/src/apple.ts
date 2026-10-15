import { registerPlugin } from '@capacitor/core';

// Bridge to ios/App/App/CampusAppleSignInPlugin.swift (Apple's AuthenticationServices; no third-party SDK).
type AppleResult = { identityToken: string; authorizationCode: string; givenName?: string; familyName?: string; email?: string };
const CampusAppleSignIn = registerPlugin<{ signIn(options: { nonce: string }): Promise<AppleResult> }>('CampusAppleSignIn');

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');

/**
 * Runs the native Sign in with Apple sheet. Apple receives SHA-256(nonce); Supabase receives the raw
 * nonce and checks it against the ID token, which prevents replaying a token from another sign-in.
 */
export async function appleSignIn() {
    const nonce = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const hashed = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)));
    const result = await CampusAppleSignIn.signIn({ nonce: hashed });
    const fullName = [result.givenName, result.familyName].filter(Boolean).join(' ').trim();
    return { idToken: result.identityToken, nonce, authorizationCode: result.authorizationCode, fullName: fullName || null };
}

export function isAppleCancel(e: unknown) {
    return e instanceof Error && /cancel/i.test(e.message);
}
