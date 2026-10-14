import { deps } from '@/lib/server/deps';
import { parseRoutes } from '@/lib/server/routes/tools';

export const runtime = 'nodejs';
// The upstream AI request times out after 45 seconds; leave room for the basic-extraction fallback.
export const maxDuration = 60;
const routes = parseRoutes(deps);
export const GET = routes.GET;
export const POST = routes.POST;
