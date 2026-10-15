import { sql } from 'drizzle-orm';
import { connection } from '../../google-server.ts';
import { unseal } from '../../google-crypto.ts';
import { googleConfig } from '../env.ts';
import { json, unauthorized, sameOrigin, readText } from '../http.ts';
import { appleConfig, revokeAppleAuthorization } from '../apple.ts';
import type { ApiDeps } from '../types.ts';

type AppleRevocation = 'not_apple' | 'revoked' | 'failed' | 'code_missing' | 'not_configured';

/**
 * POST { confirm: "DELETE", appleAuthorizationCode? } permanently deletes the signed-in user.
 * Deleting the Supabase auth user cascades to every CampusOS table and to Supabase's own session and
 * identity rows. Third-party access is revoked first (best effort, reported back to the client).
 */
export function accountRoutes(deps: ApiDeps) {
    async function deleteAccount(request: Request) {
        const user = await deps.user();
        if (!user) return unauthorized();
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
        let body: { confirm?: unknown; appleAuthorizationCode?: unknown };
        try {
            body = JSON.parse(await readText(request, 10_000));
        } catch {
            return json({ error: 'Invalid request.' }, 400);
        }
        if (body.confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm account deletion.' }, 400);
        const fetcher = deps.fetch ?? fetch, db = deps.db();

        let googleRevoked = false;
        try {
            const conn = await connection(db, user.id), google = googleConfig();
            if (conn?.refreshToken && google.ready) {
                const token = await unseal(conn.refreshToken, google.key, user.id);
                googleRevoked = (await fetcher('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10000) })).ok;
            }
        } catch { /* Deleting the stored token below still ends CampusOS access. */ }

        let apple: AppleRevocation = 'not_apple';
        if (user.providers?.includes('apple')) {
            const code = typeof body.appleAuthorizationCode === 'string' ? body.appleAuthorizationCode : '';
            const config = appleConfig();
            if (!config) apple = 'not_configured';
            else if (!code) apple = 'code_missing';
            else {
                try {
                    apple = await revokeAppleAuthorization(config, code, fetcher) ? 'revoked' : 'failed';
                } catch {
                    apple = 'failed';
                }
            }
        }

        try {
            const result = await db.execute(sql`delete from auth.users where id = ${user.id} returning id`) as unknown;
            const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
            if (!rows.length) return json({ error: 'This account was not found. It may already be deleted.' }, 404);
        } catch (e) {
            console.error('account deletion failed', e);
            return json({ error: 'Your account could not be deleted. Your CampusOS data is still there; please retry.' }, 503);
        }
        return json({ deleted: true, googleRevoked, apple });
    }
    return { deleteAccount };
}
