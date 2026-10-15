export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export const unauthorized = (message = 'Your session has ended. Sign in again to continue.') =>
    json({ error: message, code: 'unauthenticated' }, 401);

/**
 * Cookie-authenticated writes must come from this site (CSRF protection); requests without an Origin
 * header are rejected. Bearer-token requests (the iOS app) are exempt: browsers never attach that header
 * automatically, and such requests are authenticated only by the token, never by cookies.
 */
export function sameOrigin(request: Request) {
    if (request.headers.has('authorization')) return true;
    const origin = request.headers.get('origin');
    return !!origin && origin === new URL(request.url).origin;
}

export class BodyTooLargeError extends Error {}

/** Reads a request body as text, refusing anything larger than `limit` bytes. */
export async function readText(request: Request, limit: number): Promise<string> {
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > limit) throw new BodyTooLargeError();
    if (!request.body) return '';
    const reader = request.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
            await reader.cancel();
            throw new BodyTooLargeError();
        }
        chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
}
