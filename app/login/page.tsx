import type { Metadata } from 'next';
import { LoginForm } from '../auth-ui';
import { supabasePublicConfig } from '@/lib/supabase/config';

export const metadata: Metadata = { title: 'Sign in — CampusOS' };
export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function LoginPage({ searchParams }: { searchParams: Params }) {
    const p = await searchParams;
    return <LoginForm next={one(p.next)} error={one(p.error)} message={one(p.message)} configured={!!supabasePublicConfig()} />;
}
