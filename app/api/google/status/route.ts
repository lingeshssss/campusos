import { deps } from '@/lib/server/deps';
import { googleRoutes } from '@/lib/server/routes/google';

export const runtime = 'nodejs';
export const GET = googleRoutes(deps).status;
