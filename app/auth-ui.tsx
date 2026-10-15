'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, GraduationCap, KeyRound, LockKeyhole, Mail } from 'lucide-react';
import { AuthShell, Divider, GoogleGlyph, Notice, errorMessages, friendly, infoMessages } from '../shared/ui/auth-shell';
import { createSupabaseBrowserClient } from '../lib/supabase/client';
import { safeNextPath } from '../lib/safe-redirect';

function GoogleButton({ next, disabled }: { next: string; disabled: boolean }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    return <><button type="button" className="secondary auth-google" disabled={disabled || busy} onClick={async () => {
        setBusy(true);
        setError('');
        try {
            // Identity only (email/profile). Google Calendar access is a separate, explicit step inside the app.
            const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, queryParams: { prompt: 'select_account' } } });
            if (error) throw error;
        } catch (e) {
            setError(friendly(e as { message?: string }, 'Google sign-in is unavailable right now.'));
            setBusy(false);
        }
    }}><GoogleGlyph />{busy ? 'Opening Google…' : 'Continue with Google'}</button>{error && <Notice error={error} />}</>;
}

export function LoginForm({ next: rawNext, error: errorCode, message, configured }: { next?: string; error?: string; message?: string; configured: boolean }) {
    const router = useRouter(), next = safeNextPath(rawNext);
    const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
    const [error, setError] = useState(configured ? errorMessages[errorCode ?? ''] ?? '' : errorMessages.not_configured), [info, setInfo] = useState(infoMessages[message ?? ''] ?? ''), [unconfirmed, setUnconfirmed] = useState(false);
    async function resend() {
        setBusy(true);
        setError('');
        const { error } = await createSupabaseBrowserClient().auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
        setBusy(false);
        if (error) setError(friendly(error, 'Could not resend the email.'));
        else setInfo(`If ${email} has an unconfirmed account, a new confirmation email is on its way.`);
    }
    return <AuthShell eyebrow="WELCOME BACK" title="Sign in to CampusOS." intro="Pick up right where you left off." icon={<KeyRound />}>
        <GoogleButton next={next} disabled={!configured} />
        <Divider />
        <form className="form-grid" onSubmit={async e => {
            e.preventDefault();
            setBusy(true);
            setError('');
            setInfo('');
            setUnconfirmed(false);
            try {
                const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim(), password });
                if (error) {
                    setUnconfirmed(error.code === 'email_not_confirmed');
                    setError(friendly(error, 'Sign-in failed. Please retry.'));
                    setBusy(false);
                    return;
                }
                router.replace(next);
                router.refresh();
            } catch (e) {
                setError(friendly(e as { message?: string }, 'Sign-in is unavailable right now.'));
                setBusy(false);
            }
        }}>
            <label className="field"><span>Email</span><input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@university.edu" /></label>
            <label className="field"><span>Password</span><input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
            <Notice error={error} info={info} />
            {unconfirmed && <button type="button" className="text-button" disabled={busy || !email} onClick={resend}><Mail size={15} />Resend confirmation email</button>}
            <div className="setup-actions"><Link className="text-button" href="/forgot-password">Forgot password?</Link><button className="primary" disabled={busy || !configured}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button></div>
        </form>
        <p className="helper">New to CampusOS? <a className="auth-link" href={`/signup${next !== '/' ? '?next=' + encodeURIComponent(next) : ''}`}>Create an account</a></p>
    </AuthShell>;
}

export function SignupForm({ next: rawNext, configured }: { next?: string; configured: boolean }) {
    const router = useRouter(), next = safeNextPath(rawNext);
    const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(configured ? '' : errorMessages.not_configured), [sent, setSent] = useState(false);
    if (sent) return <AuthShell eyebrow="ALMOST THERE" title="Check your email." intro={`We sent a confirmation link to ${email}. Open it on this device to finish creating your account.`} icon={<Mail />}>
        <p className="helper">The link signs you in and opens CampusOS. Didn’t get it? Check spam, wait a minute, then <button className="text-button" disabled={busy} onClick={async () => {
            setBusy(true);
            const { error } = await createSupabaseBrowserClient().auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
            setBusy(false);
            setError(error ? friendly(error, 'Could not resend the email.') : '');
        }}>resend it</button>.</p>
        <Notice error={error} />
        <p className="helper"><Link className="auth-link" href="/login">Back to sign in</Link></p>
    </AuthShell>;
    return <AuthShell eyebrow="YOUR CAMPUS STARTS HERE" title="Create your account." intro="A private space for your classes, deadlines and study plans." icon={<GraduationCap />}>
        <GoogleButton next={next} disabled={!configured} />
        <Divider />
        <form className="form-grid" onSubmit={async e => {
            e.preventDefault();
            setError('');
            if (password.length < 8) return setError('Use at least 8 characters for your password.');
            if (password !== confirm) return setError('The passwords do not match.');
            setBusy(true);
            try {
                const { data, error } = await createSupabaseBrowserClient().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
                if (error) {
                    setError(friendly(error, 'Could not create the account.'));
                    setBusy(false);
                    return;
                }
                if (data.session) {
                    router.replace(next);
                    router.refresh();
                    return;
                }
                setSent(true);
                setBusy(false);
            } catch (e) {
                setError(friendly(e as { message?: string }, 'Sign-up is unavailable right now.'));
                setBusy(false);
            }
        }}>
            <label className="field"><span>Email</span><input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@university.edu" /></label>
            <div className="two"><label className="field"><span>Password</span><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /><small>At least 8 characters.</small></label><label className="field"><span>Confirm password</span><input type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label></div>
            <Notice error={error} />
            <div className="setup-actions"><a className="text-button" href={`/login${next !== '/' ? '?next=' + encodeURIComponent(next) : ''}`}>I have an account</a><button className="primary" disabled={busy || !configured}>{busy ? 'Creating…' : 'Create account'}<ArrowRight size={17} /></button></div>
        </form>
    </AuthShell>;
}

export function ForgotPasswordForm({ configured }: { configured: boolean }) {
    const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(configured ? '' : errorMessages.not_configured), [sent, setSent] = useState(false);
    return <AuthShell eyebrow="RESET YOUR PASSWORD" title="Forgot your password?" intro="Enter your account email and we’ll send a secure reset link." icon={<Mail />}>
        {sent ? <><Notice info={`If an account exists for ${email}, a reset link is on its way. It expires after a short time and works once.`} /><p className="helper">Open the link on this device. You’ll be asked to choose a new password.</p></> : <form className="form-grid" onSubmit={async e => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
                const { error } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/update-password')}` });
                if (error && error.code !== 'user_not_found') throw error;
                setSent(true);
            } catch (e) {
                setError(friendly(e as { message?: string }, 'Could not send the reset email.'));
            } finally {
                setBusy(false);
            }
        }}>
            <label className="field"><span>Email</span><input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
            <Notice error={error} />
            <div className="setup-actions"><Link className="text-button" href="/login">Back to sign in</Link><button className="primary" disabled={busy || !configured}>{busy ? 'Sending…' : 'Send reset link'}<ArrowRight size={17} /></button></div>
        </form>}
    </AuthShell>;
}

export function UpdatePasswordForm({ email }: { email: string | null }) {
    const router = useRouter();
    const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
    return <AuthShell eyebrow="ACCOUNT SECURITY" title="Choose a new password." intro={email ? `For ${email}.` : 'For your CampusOS account.'} icon={<LockKeyhole />}>
        {done ? <><Notice info="Your password was updated." /><div className="setup-actions"><span /><button className="primary" onClick={() => { router.replace('/'); router.refresh(); }}>Go to my dashboard<ArrowRight size={17} /></button></div></> : <form className="form-grid" onSubmit={async e => {
            e.preventDefault();
            setError('');
            if (password.length < 8) return setError('Use at least 8 characters for your password.');
            if (password !== confirm) return setError('The passwords do not match.');
            setBusy(true);
            try {
                const { error } = await createSupabaseBrowserClient().auth.updateUser({ password });
                if (error) {
                    setError(error.code === 'session_not_found' || error.status === 401 ? 'Your reset session expired. Request a new reset link.' : friendly(error, 'Could not update the password.'));
                    return;
                }
                setDone(true);
            } catch (e) {
                setError(friendly(e as { message?: string }, 'Could not update the password.'));
            } finally {
                setBusy(false);
            }
        }}>
            <div className="two"><label className="field"><span>New password</span><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /><small>At least 8 characters.</small></label><label className="field"><span>Confirm new password</span><input type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label></div>
            <Notice error={error} />
            <div className="setup-actions"><Link className="text-button" href="/">Cancel</Link><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}<ArrowRight size={17} /></button></div>
        </form>}
    </AuthShell>;
}
