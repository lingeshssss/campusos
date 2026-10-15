// Sign in with Apple token revocation, required by Apple when an account that used Sign in with Apple is
// deleted. The app asks the user to confirm with Apple once more; this server exchanges that one-time
// authorization code for a token and immediately revokes it. Nothing from Apple is stored.

export type AppleConfig = { teamId: string; keyId: string; privateKey: string; clientId: string };

const blank = (v: string | undefined) => (v ?? '').trim();

/** Server-only Apple settings. Returns null when revocation is not configured. */
export function appleConfig(env: Record<string, string | undefined> = process.env): AppleConfig | null {
    const teamId = blank(env.APPLE_TEAM_ID), keyId = blank(env.APPLE_SIGNIN_KEY_ID), clientId = blank(env.IOS_BUNDLE_ID);
    // Vercel stores multi-line values fine, but accept "\n"-escaped PEMs too.
    const privateKey = blank(env.APPLE_SIGNIN_PRIVATE_KEY).replaceAll('\\n', '\n');
    if (!/^[A-Z0-9]{10}$/.test(teamId) || !/^[A-Z0-9]{10}$/.test(keyId) || !clientId || !privateKey.includes('PRIVATE KEY')) return null;
    return { teamId, keyId, privateKey, clientId };
}

const b64url = (bytes: Uint8Array | string) => Buffer.from(bytes).toString('base64url');

/** ES256 client secret JWT for Apple's REST API (valid for 5 minutes). */
export async function appleClientSecret(config: AppleConfig, nowSeconds = Math.floor(Date.now() / 1000)) {
    const der = Buffer.from(config.privateKey.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, ''), 'base64');
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const header = b64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }));
    const payload = b64url(JSON.stringify({ iss: config.teamId, iat: nowSeconds, exp: nowSeconds + 300, aud: 'https://appleid.apple.com', sub: config.clientId }));
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`)));
    return `${header}.${payload}.${b64url(signature)}`;
}

/** Exchanges a fresh authorization code and revokes the resulting token. Returns true only if Apple confirms. */
export async function revokeAppleAuthorization(config: AppleConfig, authorizationCode: string, fetcher: typeof fetch = fetch): Promise<boolean> {
    const secret = await appleClientSecret(config);
    const form = (fields: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields), signal: AbortSignal.timeout(10000) });
    const exchange = await fetcher('https://appleid.apple.com/auth/token', form({ client_id: config.clientId, client_secret: secret, code: authorizationCode, grant_type: 'authorization_code' }));
    const tokens = await exchange.json().catch(() => ({})) as { refresh_token?: string; access_token?: string };
    const token = tokens.refresh_token ?? tokens.access_token;
    if (!exchange.ok || !token) return false;
    const revoke = await fetcher('https://appleid.apple.com/auth/revoke', form({ client_id: config.clientId, client_secret: secret, token, token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token' }));
    return revoke.ok;
}
