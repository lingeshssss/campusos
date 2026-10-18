import type { Metadata } from 'next';
import { Smartphone } from 'lucide-react';
import { AuthShell } from '@/shared/ui/auth-shell';
import { mobileFallbackLink } from '@/lib/server/app-links';

export const metadata: Metadata = { title: 'Open CampusOS — CampusOS' };
export const dynamic = 'force-dynamic';

/**
 * Email links requested from the iPhone or Android app point here. With the app installed, the phone opens
 * the app directly (iOS universal link / Android App Link) and this page is never shown. Otherwise it
 * explains what to do; the one-time code only works in the app that requested it (PKCE), so it is useless
 * anywhere else.
 */
export default async function MobileCallback({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const link = mobileFallbackLink(await searchParams);
    return <AuthShell eyebrow="CAMPUSOS APP" title="Open this link on your phone." intro="This link finishes signing in to the CampusOS app. Open it on the phone where you requested it, with CampusOS installed." icon={<Smartphone />}>
        {link && <p className="helper">Already on that phone and the app didn’t open? <a className="auth-link" href={link}>Open in the CampusOS app</a></p>}
        <p className="helper">Using CampusOS on the web instead? <a className="auth-link" href="/login">Go to the website sign-in</a></p>
    </AuthShell>;
}
