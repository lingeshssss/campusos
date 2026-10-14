import type { Metadata } from 'next';
import { SignupForm } from '../auth-ui';
import { supabasePublicConfig } from '@/lib/supabase/config';

export const metadata: Metadata = { title: 'Create your account — CampusOS' };
export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const next = (await searchParams).next;
    return <SignupForm next={typeof next === 'string' ? next : undefined} configured={!!supabasePublicConfig()} />;
}
