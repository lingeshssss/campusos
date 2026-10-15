'use client';
import { AlertCircle, CheckCircle2, GraduationCap, LockKeyhole } from 'lucide-react';

// Sign-in visuals and error wording shared by the website and the iOS app.
export const errorMessages: Record<string, string> = {
    link_expired: 'That link has expired or was already used. Sign in, or request a new email below.',
    reset_expired: 'That password reset link has expired or was already used. Request a new one.',
    oauth_failed: 'Sign-in with Google or Apple did not finish. Try again, or use your email and password.',
    session_expired: 'Your session ended. Sign in again to continue.',
    not_configured: 'Sign-in is not configured for this deployment yet. The app owner needs to add the Supabase settings.',
};
export const infoMessages: Record<string, string> = {
    signed_out: 'You are signed out.',
    password_updated: 'Your password was updated. Sign in with your new password.',
    account_deleted: 'Your CampusOS account and its data were permanently deleted.',
};

export function friendly(error: { message?: string; code?: string } | null | undefined, fallback: string) {
    const code = error?.code ?? '';
    if (code === 'invalid_credentials') return 'That email and password do not match. Check them, or reset your password.';
    if (code === 'email_not_confirmed') return 'Confirm your email first. Check your inbox for the CampusOS confirmation link, or resend it below.';
    if (code === 'user_already_exists' || code === 'email_exists') return 'An account with this email already exists. Sign in instead.';
    if (code === 'weak_password') return error?.message || 'Choose a stronger password.';
    if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Too many attempts. Wait a minute, then try again.';
    if (code === 'same_password') return 'Choose a password different from your current one.';
    return error?.message || fallback;
}

export function AuthShell({ eyebrow, title, intro, icon, children }: { eyebrow: string; title: string; intro: string; icon: React.ReactNode; children: React.ReactNode }) {
    return <div className="setup auth-page"><aside className="setup-aside"><a className="brand" href="/"><span className="brand-icon"><GraduationCap /></span>Campus<span>OS</span></a><div><p className="eyebrow">LESS JUGGLING. MORE LIVING.</p><h1>Your campus.<br />Your rhythm.<br /><em>All together.</em></h1><p>Classes, deadlines, grades and study time in one calm place.</p></div><small>Made for the beautifully busy college life.</small></aside><main className="setup-main"><div className="setup-top"><span>{eyebrow}</span><span>CAMPUSOS</span></div><div className="setup-content"><span className="round-icon">{icon}</span><h1>{title}</h1><p className="muted">{intro}</p>{children}</div><p className="setup-foot"><LockKeyhole size={14} />Your data is private to your account.</p></main></div>;
}

export function Notice({ error, info }: { error?: string; info?: string }) {
    return <>{error && <p role="alert" className="error"><AlertCircle size={15} /> {error}</p>}{info && <p role="status" className="success-note"><CheckCircle2 size={17} />{info}</p>}</>;
}

export function GoogleGlyph() {
    return <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>;
}

export function Divider() {
    return <div className="auth-divider"><span>or use email</span></div>;
}
