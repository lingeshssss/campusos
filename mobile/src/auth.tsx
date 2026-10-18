import { useState } from 'react';
import { deviceName } from './device';
import { Browser } from '@capacitor/browser';
import { ArrowRight, GraduationCap, KeyRound, LockKeyhole, Mail } from 'lucide-react';
import { AuthShell, Divider, GoogleGlyph, Notice, errorMessages, friendly, infoMessages } from '../../shared/ui/auth-shell';
import { config } from './config';
import { supabase } from './supabase';
import { appleSignIn, isAppleCancel } from './apple';

export type AuthScreen = 'login' | 'signup' | 'forgot';

/** Turns thrown errors (network, Keychain, Supabase) into a message so no screen is left spinning. */
function failure(e: unknown, fallback: string) {
    const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
    if (/OS error|-34018|keychain/i.test(message)) return `CampusOS couldn’t use this ${deviceName}’s secure storage. Restart the app and try again.`;
    if (/Failed to fetch|Load failed|NetworkError/i.test(message)) return 'CampusOS couldn’t reach the server. Check your connection and try again.';
    return friendly(e as { message?: string; code?: string }, fallback);
}
export type AuthNotice = { error?: string; info?: string };

function AppleGlyph() {
    return <svg width="16" height="16" viewBox="0 0 814 1000" aria-hidden="true" fill="currentColor"><path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-164-40c-76 0-104 41-166 41s-106-57-156-128C46 790 0 667 0 550c0-188 122-288 243-288 64 0 117 42 157 42 38 0 98-45 171-45 28 0 128 3 194 82zM555 167c30-36 51-86 51-136 0-7-1-14-2-20-49 2-107 33-142 73-27 31-53 81-53 132 0 8 1 15 2 18 3 1 9 2 14 2 44 0 99-30 130-69z" /></svg>;
}

function ProviderButtons({ onError }: { onError(message: string): void }) {
    const [busy, setBusy] = useState<'' | 'apple' | 'google'>('');
    if (!config.apple && !config.google) return null;
    return <>
        {config.apple && <button type="button" className="secondary auth-google auth-apple" disabled={!!busy} onClick={async () => {
            setBusy('apple');
            try {
                const apple = await appleSignIn();
                const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: apple.idToken, nonce: apple.nonce });
                if (error) throw error;
                // Apple shares the name only on the first authorization; keep it for the profile greeting.
                if (apple.fullName) await supabase.auth.updateUser({ data: { full_name: apple.fullName } }).catch(() => undefined);
            } catch (e) {
                if (!isAppleCancel(e)) onError(failure(e, 'Sign in with Apple did not finish. Try again.'));
            } finally {
                setBusy('');
            }
        }}><AppleGlyph />{busy === 'apple' ? 'Waiting for Apple…' : 'Sign in with Apple'}</button>}
        {config.google && <button type="button" className="secondary auth-google" disabled={!!busy} onClick={async () => {
            setBusy('google');
            try {
                // Identity only (email/profile). Google Calendar access is a separate step on the website.
                const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: config.oauthCallback, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
                if (error || !data.url) throw error ?? Error('Google sign-in is unavailable right now.');
                await Browser.open({ url: data.url, presentationStyle: 'popover' });
            } catch (e) {
                onError(failure(e, 'Google sign-in is unavailable right now.'));
            } finally {
                setBusy('');
            }
        }}><GoogleGlyph />{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</button>}
        <Divider />
    </>;
}

export function AuthScreens({ screen, setScreen, notice }: { screen: AuthScreen; setScreen(s: AuthScreen): void; notice: AuthNotice }) {
    const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false);
    const [error, setError] = useState(notice.error ?? ''), [info, setInfo] = useState(notice.info ?? ''), [sent, setSent] = useState<'' | 'signup' | 'reset'>(''), [unconfirmed, setUnconfirmed] = useState(false);
    const go = (s: AuthScreen) => { setScreen(s); setError(''); setInfo(''); setSent(''); };
    const resend = async () => {
        setBusy(true);
        try {
            const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: config.emailCallback } });
            if (error) setError(friendly(error, 'Could not resend the email.'));
            else setInfo(`If ${email} has an unconfirmed account, a new confirmation email is on its way.`);
        } catch (e) {
            setError(failure(e, 'Could not resend the email.'));
        } finally {
            setBusy(false);
        }
    };
    const emailField = <label className="field"><span>Email</span><input type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@university.edu" /></label>;

    if (sent) return <AuthShell eyebrow={sent === 'signup' ? 'ALMOST THERE' : 'RESET YOUR PASSWORD'} title="Check your email." intro={sent === 'signup' ? `We sent a confirmation link to ${email}. Open it on this ${deviceName}: it opens CampusOS and signs you in.` : `If an account exists for ${email}, a reset link is on its way. Open it on this ${deviceName} to choose a new password.`} icon={<Mail />}>
        <Notice error={error} info={info} />
        {sent === 'signup' && <p className="helper">Didn’t get it? Check spam, wait a minute, then <button className="text-button" disabled={busy} onClick={resend}>resend it</button>. If you confirmed in a browser instead, come back and sign in.</p>}
        <div className="setup-actions"><span /><button className="primary" onClick={() => go('login')}>Back to sign in<ArrowRight size={17} /></button></div>
    </AuthShell>;

    if (screen === 'forgot') return <AuthShell eyebrow="RESET YOUR PASSWORD" title="Forgot your password?" intro="Enter your account email and we’ll send a secure reset link." icon={<Mail />}>
        <form className="form-grid" onSubmit={async e => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
                const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${config.emailCallback}?next=update-password` });
                if (error && error.code !== 'user_not_found') setError(friendly(error, 'Could not send the reset email.'));
                else setSent('reset');
            } catch (e) {
                setError(failure(e, 'Could not send the reset email.'));
            } finally {
                setBusy(false);
            }
        }}>
            {emailField}
            <Notice error={error} />
            <div className="setup-actions"><button type="button" className="text-button" onClick={() => go('login')}>Back to sign in</button><button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}<ArrowRight size={17} /></button></div>
        </form>
    </AuthShell>;

    if (screen === 'signup') return <AuthShell eyebrow="YOUR CAMPUS STARTS HERE" title="Create your account." intro="A private space for your classes, deadlines and study plans." icon={<GraduationCap />}>
        <ProviderButtons onError={setError} />
        <form className="form-grid" onSubmit={async e => {
            e.preventDefault();
            setError('');
            if (password.length < 8) return setError('Use at least 8 characters for your password.');
            if (password !== confirm) return setError('The passwords do not match.');
            setBusy(true);
            try {
                const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: config.emailCallback } });
                if (error) setError(friendly(error, 'Could not create the account.'));
                else if (!data.session) setSent('signup');
            } catch (e) {
                setError(failure(e, 'Could not create the account.'));
            } finally {
                setBusy(false);
            }
        }}>
            {emailField}
            <label className="field"><span>Password</span><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
            <label className="field"><span>Confirm password</span><input type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
            <Notice error={error} />
            <div className="setup-actions"><button type="button" className="text-button" onClick={() => go('login')}>I have an account</button><button className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}<ArrowRight size={17} /></button></div>
        </form>
    </AuthShell>;

    return <AuthShell eyebrow="WELCOME BACK" title="Sign in to CampusOS." intro="Pick up right where you left off." icon={<KeyRound />}>
        <ProviderButtons onError={setError} />
        <form className="form-grid" onSubmit={async e => {
            e.preventDefault();
            setBusy(true);
            setError('');
            setInfo('');
            try {
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (error) {
                    setUnconfirmed(error.code === 'email_not_confirmed');
                    setError(friendly(error, 'Sign-in failed. Please retry.'));
                }
            } catch (e) {
                setError(failure(e, 'Sign-in failed. Please retry.'));
            } finally {
                setBusy(false);
            }
        }}>
            {emailField}
            <label className="field"><span>Password</span><input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
            <Notice error={error} info={info} />
            {unconfirmed && <button type="button" className="text-button" disabled={busy || !email} onClick={resend}><Mail size={15} />Resend confirmation email</button>}
            <div className="setup-actions"><button type="button" className="text-button" onClick={() => go('forgot')}>Forgot password?</button><button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button></div>
        </form>
        <p className="helper">New to CampusOS? <button type="button" className="text-button" onClick={() => go('signup')}>Create an account</button></p>
    </AuthShell>;
}

export function UpdatePassword({ email, onDone }: { email: string | null; onDone(): void }) {
    const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    return <AuthShell eyebrow="ACCOUNT SECURITY" title="Choose a new password." intro={email ? `For ${email}.` : 'For your CampusOS account.'} icon={<LockKeyhole />}>
        <form className="form-grid" onSubmit={async e => {
            e.preventDefault();
            setError('');
            if (password.length < 8) return setError('Use at least 8 characters for your password.');
            if (password !== confirm) return setError('The passwords do not match.');
            setBusy(true);
            try {
                const { error } = await supabase.auth.updateUser({ password });
                if (error) setError(friendly(error, 'Could not update the password.'));
                else onDone();
            } catch (e) {
                setError(failure(e, 'Could not update the password.'));
            } finally {
                setBusy(false);
            }
        }}>
            <label className="field"><span>New password</span><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
            <label className="field"><span>Confirm new password</span><input type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
            <Notice error={error} />
            <div className="setup-actions"><button type="button" className="text-button" onClick={onDone}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}<ArrowRight size={17} /></button></div>
        </form>
    </AuthShell>;
}

export const signedOutNotices: Record<string, AuthNotice> = {
    signed_out: { info: infoMessages.signed_out + ` Data saved on this ${deviceName} was erased.` },
    account_deleted: { info: infoMessages.account_deleted + ` Data saved on this ${deviceName} was erased.` },
    session_expired: { error: errorMessages.session_expired + ` Edits saved on this ${deviceName} sync after you sign in to the same account.` },
    link_expired: { error: errorMessages.link_expired },
    oauth_failed: { error: errorMessages.oauth_failed },
};
