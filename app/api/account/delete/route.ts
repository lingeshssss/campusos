import { deps } from '@/lib/server/deps';
import { accountRoutes } from '@/lib/server/routes/account';

export const runtime = 'nodejs';
export const POST = accountRoutes(deps).deleteAccount;
