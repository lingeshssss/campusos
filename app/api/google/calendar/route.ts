import { deps } from '@/lib/server/deps';
import { googleRoutes } from '@/lib/server/routes/google';

export const runtime = 'nodejs';
export const POST = googleRoutes(deps).createCalendar;
