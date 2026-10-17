/** Turns a database failure into a short, secret-free hint so deployment problems are visible on screen. */
export function describeDbError(e: unknown): string {
    // Drizzle wraps driver errors; the useful code is on the cause.
    const err = (e as { cause?: unknown })?.cause ?? e;
    const code = String((err as { code?: unknown })?.code ?? '');
    const message = String((err as { message?: unknown })?.message ?? (e as { message?: unknown })?.message ?? '');

    if (/DATABASE_URL is not configured/.test(message) || /DATABASE_URL is not configured/.test(String((e as { message?: unknown })?.message)))
        return 'DATABASE_URL is not set for this deployment. Add it to Production in Vercel, then redeploy.';
    if (code === 'ERR_INVALID_URL' || /Invalid URL/i.test(message))
        return 'DATABASE_URL is not a valid connection string (check for quotes, spaces, [brackets] or special characters in the password).';
    if (['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code))
        return 'The database host in DATABASE_URL cannot be reached. Use the Transaction pooler host (…pooler.supabase.com, port 6543).';
    if (code === 'CONNECT_TIMEOUT' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT')
        return 'Timed out connecting to the database. Check the host and port (6543) in DATABASE_URL.';
    if (code === '28P01' || /password authentication failed/i.test(message))
        return 'The database password in DATABASE_URL is wrong.';
    if (/Tenant or user not found/i.test(message))
        return 'The user or region in DATABASE_URL is wrong. The user must be postgres.YOUR-PROJECT-REF, copied from Supabase → Connect → Transaction pooler.';
    if (code === '42P01')
        return 'The database tables do not exist yet. Run `pnpm db:migrate`.';
    return `Database error${code ? ` (${code})` : ''}.`;
}
