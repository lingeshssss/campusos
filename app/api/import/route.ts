import { deps } from '@/lib/server/deps';
import { importRoutes } from '@/lib/server/routes/state';

export const runtime = 'nodejs';
export const POST = importRoutes(deps).POST;
