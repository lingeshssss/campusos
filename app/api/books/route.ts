import { deps } from '@/lib/server/deps';
import { bookRoutes } from '@/lib/server/routes/tools';

export const runtime = 'nodejs';
export const GET = bookRoutes(deps).GET;
