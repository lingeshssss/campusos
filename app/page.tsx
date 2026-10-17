import { redirect } from 'next/navigation';
import CampusApp from '@/shared/ui/campus-app';
import { getSessionUser } from '@/lib/supabase/server';
import { supabasePublicConfig } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams: Params }) {
    if (!supabasePublicConfig()) redirect('/login?error=not_configured');
    const user = await getSessionUser();
    if (!user) redirect('/login');
    const params = await searchParams;
    return <>
        {/* Runs during HTML parsing, before the app paints: drop a cached school palette from another account. */}
        <script dangerouslySetInnerHTML={{ __html: `window.__campusTheme&&window.__campusTheme.forUser(${JSON.stringify(user.id).replace(/</g, '\\u003c')})` }} />
        <CampusApp userId={user.id} displayName={user.name?.split(' ')[0] ?? ''} email={user.email} initialView={params.calendar || params.view === 'calendar' ? 'Calendar sync' : 'Today'} initialToast={params.welcome === 'confirmed' ? 'Email confirmed. Welcome to CampusOS.' : ''} />
    </>;
}
