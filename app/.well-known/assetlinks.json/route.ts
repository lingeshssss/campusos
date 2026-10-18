import { androidAssetLinks } from '@/lib/server/app-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Android verifies App Links by fetching this file (application/json, no redirects).
export function GET() {
    const body = androidAssetLinks();
    if (!body) return new Response('Not configured', { status: 404 });
    return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
