import type { Metadata } from 'next';
import { ForgotPasswordForm } from '../auth-ui';
import { supabasePublicConfig } from '@/lib/supabase/config';

export const metadata: Metadata = { title: 'Reset password — CampusOS' };
export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
    return <ForgotPasswordForm configured={!!supabasePublicConfig()} />;
}
