import { deps } from '@/lib/server/deps';
import { googleRoutes } from '@/lib/server/routes/google';

export const runtime = 'nodejs';
// Preview pages through Google for up to 65 seconds; sync stops a batch at 50 seconds.
export const maxDuration = 90;
export const POST = googleRoutes(deps).sync;
