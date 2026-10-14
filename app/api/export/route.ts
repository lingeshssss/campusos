import { deps } from '@/lib/server/deps';
import { exportRoutes } from '@/lib/server/routes/state';

export const runtime = 'nodejs';
export const GET = exportRoutes(deps).GET;
