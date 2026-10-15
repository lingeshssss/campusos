import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy — CampusOS', description: 'How CampusOS handles your data.' };
export const dynamic = 'force-dynamic';

// Describes what the CampusOS code actually does. Review it (and set SUPPORT_EMAIL) before publishing
// the iOS app; App Store Connect requires a privacy policy URL.
export default function PrivacyPage() {
    const contact = process.env.SUPPORT_EMAIL?.trim();
    return <main className="content privacy-page">
        <p className="eyebrow">CAMPUSOS</p>
        <h1>Privacy</h1>
        <p className="muted">CampusOS is a personal college planner. This page explains what it stores, where, and why.</p>

        <section className="panel"><h2>What we store</h2>
            <p><strong>Your account:</strong> email address, and a name if you sign in with Apple or Google or enter one. Passwords are handled by our sign-in provider (Supabase Auth) and never stored by CampusOS in readable form.</p>
            <p><strong>What you enter:</strong> your school, studies and semester dates, classes, deadlines (with short syllabus excerpts you keep), textbooks and price notes, grades, next-semester plans, study blocks, timer sessions and flashcards.</p>
            <p>This data is stored in a database (Supabase Postgres) and is accessible only when you are signed in. It is used only to run CampusOS for you. There is no advertising, no tracking, no analytics SDK, and your data is never sold or shared for marketing.</p>
        </section>

        <section className="panel"><h2>Services that receive data</h2>
            <p><strong>Hosting and storage:</strong> Vercel (runs the website and API) and Supabase (sign-in and database).</p>
            <p><strong>Syllabus and quick-add parsing:</strong> text you choose to parse is sent to the CampusOS server. If AI parsing is enabled, that text is also sent to OpenAI to extract dates, with storage disabled on the request. PDF files are read on your device; only the extracted text is sent.</p>
            <p><strong>ISBN lookup:</strong> when you look up a book, its ISBN is sent to Open Library.</p>
            <p><strong>Google Calendar (optional):</strong> only if you connect it. CampusOS can create and manage its own “CampusOS” calendar, not your other calendars. Its access token is stored encrypted and is revoked when you disconnect or delete your account.</p>
            <p><strong>Sign in with Apple or Google (optional):</strong> those providers confirm your identity and share your email (Apple can hide it) and name.</p>
        </section>

        <section className="panel"><h2>On your iPhone</h2>
            <p>The iOS app keeps your sign-in session in the iOS Keychain and an encrypted copy of your data on the device so schedules and flashcards work offline. Reminders are scheduled on the device and are off unless you turn them on. Signing out or deleting your account erases this local data.</p>
        </section>

        <section className="panel"><h2>Your choices</h2>
            <p><strong>Download:</strong> Settings → Download my data exports everything you entered as a file.</p>
            <p><strong>Delete:</strong> Settings → Account → Delete account permanently deletes your account and all of its data, and revokes Google Calendar and Sign in with Apple access where connected.</p>
            {contact ? <p><strong>Contact:</strong> <a className="auth-link" href={`mailto:${contact}`}>{contact}</a></p> : null}
        </section>
    </main>;
}
