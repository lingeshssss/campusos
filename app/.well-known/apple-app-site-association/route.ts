import { appleAppSiteAssociation } from '@/lib/server/app-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
    const body = appleAppSiteAssociation();
    if (!body) return new Response('Not configured', { status: 404 });
    return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
