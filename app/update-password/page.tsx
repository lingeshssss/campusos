import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UpdatePasswordForm } from '../auth-ui';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'New password — CampusOS' };
export const dynamic = 'force-dynamic';

export default async function UpdatePasswordPage() {
    const user = await getSessionUser();
    if (!user) redirect('/login?error=reset_expired');
    return <UpdatePasswordForm email={user.email} />;
}
