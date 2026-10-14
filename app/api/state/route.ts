import { deps } from '@/lib/server/deps';
import { stateRoutes } from '@/lib/server/routes/state';

export const runtime = 'nodejs';
const routes = stateRoutes(deps);
export const GET = routes.GET;
export const PUT = routes.PUT;
