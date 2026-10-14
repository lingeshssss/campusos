import { deps } from '@/lib/server/deps';
import { plannerRoutes } from '@/lib/server/routes/tools';

export const runtime = 'nodejs';
export const POST = plannerRoutes(deps).POST;
