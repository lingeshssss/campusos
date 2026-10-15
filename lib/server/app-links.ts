// Universal links: lets https://APP_ORIGIN/auth/mobile-callback open the CampusOS iOS app.
// APPLE_TEAM_ID and IOS_BUNDLE_ID are public identifiers, not secrets.
export function appleAppSiteAssociation(env: Record<string, string | undefined> = process.env) {
    const team = (env.APPLE_TEAM_ID ?? '').trim(), bundle = (env.IOS_BUNDLE_ID ?? '').trim();
    if (!/^[A-Z0-9]{10}$/.test(team) || !/^[A-Za-z0-9.-]+$/.test(bundle)) return null;
    return { applinks: { details: [{ appIDs: [`${team}.${bundle}`], components: [{ '/': '/auth/mobile-callback', comment: 'Supabase email confirmation and password reset for the iOS app' }] }] } };
}

/** The app's custom URL scheme callback (used for OAuth in the in-app browser and as a manual fallback). */
export const MOBILE_SCHEME_CALLBACK = 'campusos://auth/callback';

/** Builds the fallback deep link from a callback URL, forwarding only the parameters the app understands. */
export function mobileFallbackLink(params: Record<string, string | string[] | undefined>): string | null {
    const allowed = ['code', 'next', 'error', 'error_code', 'error_description'];
    const out = new URLSearchParams();
    for (const key of allowed) {
        const value = params[key];
        if (typeof value === 'string' && value.length <= 2000) out.set(key, value);
    }
    if (!out.has('code') && !out.has('error')) return null;
    if (out.has('next') && out.get('next') !== 'update-password') out.delete('next');
    return `${MOBILE_SCHEME_CALLBACK}?${out.toString()}`;
}
