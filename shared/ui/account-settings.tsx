'use client';
import { useState } from 'react';
import { AlertCircle, KeyRound, LogOut, Trash2 } from 'lucide-react';
import { platform } from '../platform';

/**
 * Settings → Account: change password, sign out and permanent account deletion (App Store 5.1.1(v),
 * Google Play account deletion). Password accounts re-enter their password before deleting; the server
 * enforces this with a recent-sign-in check.
 */
export default function AccountSettings({ email, passwordAccount = false }: { email: string | null; passwordAccount?: boolean }) {
    const [deleting, setDeleting] = useState(false), [typed, setTyped] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const p = platform();
    const needsPassword = passwordAccount && !!email;
    const ready = typed.trim() === 'DELETE' && (!needsPassword || password.length > 0);
    return <section className="panel">
        <h2>Account</h2>
        <p className="helper">Signed in as <strong>{email ?? 'your CampusOS account'}</strong>. Signing in with Google or Apple only identifies you; Google Calendar access is a separate step in Calendar sync.</p>
        <div className="account-row">
            <button className="secondary" onClick={() => p.changePassword()}><KeyRound size={16} />Change password</button>
            <button className="secondary" onClick={() => void p.signOut()}><LogOut size={16} />Sign out</button>
        </div>
        <div className="danger-zone">
            <h3>Delete account</h3>
            <p className="helper">Permanently deletes your CampusOS account and everything saved with it: profile, classes, deadlines, textbooks, grades, planner, study history and any Google Calendar connection (access is revoked; events already in Google stay). {p.deviceName ? `Data and reminders stored on this ${p.deviceName} are erased too. ` : ''}This cannot be undone. Download your data first if you may want it.</p>
            {!deleting ? <button className="secondary" onClick={() => { setDeleting(true); setTyped(''); setPassword(''); setError(''); }}><Trash2 size={16} />Delete my account…</button> : <form className="book-notice" onSubmit={async e => {
                e.preventDefault();
                if (!ready) return;
                setBusy(true);
                setError('');
                try {
                    await p.deleteAccount(needsPassword ? { email: email!, password } : undefined);
                } catch (e) {
                    setError(e instanceof Error ? e.message : 'Your account could not be deleted. Nothing was removed; please retry.');
                    setBusy(false);
                }
            }}>
                <label className="field"><span>Type DELETE to confirm</span><input value={typed} autoCapitalize="characters" autoComplete="off" onChange={e => setTyped(e.target.value)} /></label>
                {needsPassword && <label className="field"><span>Your password</span><input type="password" value={password} autoComplete="current-password" onChange={e => setPassword(e.target.value)} /><small>Confirms it’s you before anything is deleted.</small></label>}
                {error && <p role="alert" className="error"><AlertCircle size={15} /> {error}</p>}
                <div className="modal-actions">
                    <button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(false)}>Keep my account</button>
                    <button type="submit" className="danger" disabled={busy || !ready}>{busy ? 'Deleting…' : 'Permanently delete'}</button>
                </div>
            </form>}
        </div>
    </section>;
}
