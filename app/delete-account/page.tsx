import type { Metadata } from 'next';
import { Trash2 } from 'lucide-react';
import { AuthShell } from '@/shared/ui/auth-shell';

export const metadata: Metadata = { title: 'Delete your CampusOS account — CampusOS', description: 'How to permanently delete your CampusOS account and its data.' };
export const dynamic = 'force-dynamic';

// Public page (no sign-in needed to read it) for app-store account deletion requirements.
// Describes exactly what lib/server/routes/account.ts does.
export default function DeleteAccountPage() {
    const contact = process.env.SUPPORT_EMAIL?.trim();
    return <AuthShell eyebrow="CAMPUSOS" title="Delete your account." intro="You can permanently delete your CampusOS account and everything saved with it, from the website or the app." icon={<Trash2 />}>
        <ol className="helper delete-steps">
            <li><a className="auth-link" href="/login?next=/">Sign in to CampusOS</a> (or open the CampusOS app).</li>
            <li>Go to <strong>Settings → Account → Delete my account</strong>.</li>
            <li>Type DELETE. If you use a password, enter it to confirm it’s you. Then choose <strong>Permanently delete</strong>.</li>
        </ol>
        <p className="helper"><strong>What is deleted, immediately and permanently:</strong> your sign-in account and email address, profile, classes, deadlines, textbooks, grades, next-semester plans, study blocks, timer history and flashcards. A connected Google Calendar is disconnected and CampusOS’s access is revoked; events already in your Google Calendar stay there. The app also erases the copy stored on your phone and any scheduled reminders.</p>
        <p className="helper"><strong>What is kept:</strong> nothing that identifies you in CampusOS’s database. Standard hosting logs kept by our providers may briefly contain request records before they expire.</p>
        <p className="helper">Want a copy first? Use <strong>Settings → Download my data</strong> before deleting.</p>
        {contact ? <p className="helper">Can’t sign in? Email <a className="auth-link" href={`mailto:${contact}?subject=CampusOS%20account%20deletion`}>{contact}</a> from your account’s email address to request deletion.</p> : <p className="helper">Can’t sign in? Use <a className="auth-link" href="/forgot-password">Forgot password</a> to regain access, then delete the account.</p>}
        <p className="helper"><a className="auth-link" href="/privacy">Privacy policy</a></p>
    </AuthShell>;
}
