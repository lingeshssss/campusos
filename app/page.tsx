import { redirect } from 'next/navigation';
import CampusApp from './campus-app';
import { getSessionUser } from '@/lib/supabase/server';
import { supabasePublicConfig } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams: Params }) {
    if (!supabasePublicConfig()) redirect('/login?error=not_configured');
    const user = await getSessionUser();
    if (!user) redirect('/login');
    const params = await searchParams;
    return <CampusApp displayName={user.name?.split(' ')[0] ?? ''} email={user.email} initialView={params.calendar ? 'Calendar sync' : 'Today'} initialToast={params.welcome === 'confirmed' ? 'Email confirmed. Welcome to CampusOS.' : ''} />;
}
