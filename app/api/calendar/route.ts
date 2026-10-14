import { deps } from '@/lib/server/deps';
import { calendarRoutes } from '@/lib/server/routes/tools';

export const runtime = 'nodejs';
export const GET = calendarRoutes(deps).GET;
