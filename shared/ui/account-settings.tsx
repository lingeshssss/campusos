'use client';
import { useState } from 'react';
import { AlertCircle, KeyRound, LogOut, Trash2 } from 'lucide-react';
import { platform } from '../platform';

/** Settings → Account: change password, sign out and permanent account deletion (App Store 5.1.1(v)). */
export default function AccountSettings({ email }: { email: string | null }) {
    const [deleting, setDeleting] = useState(false), [typed, setTyped] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const p = platform();
    return <section className="panel">
        <h2>Account</h2>
        <p className="helper">Signed in as <strong>{email ?? 'your CampusOS account'}</strong>. Signing in with Google or Apple only identifies you; Google Calendar access is a separate step in Calendar sync.</p>
        <div className="account-row">
            <button className="secondary" onClick={() => p.changePassword()}><KeyRound size={16} />Change password</button>
            <button className="secondary" onClick={() => void p.signOut()}><LogOut size={16} />Sign out</button>
        </div>
        <div className="danger-zone">
            <h3>Delete account</h3>
            <p className="helper">Permanently deletes your CampusOS account and everything saved with it: profile, classes, deadlines, textbooks, grades, planner, study history and any Google Calendar connection (access is revoked; events already in Google stay). {p.kind === 'ios' ? 'Data stored on this iPhone is erased too. ' : ''}This cannot be undone. Download your data first if you may want it.</p>
            {!deleting ? <button className="secondary" onClick={() => { setDeleting(true); setTyped(''); setError(''); }}><Trash2 size={16} />Delete my account…</button> : <div className="book-notice">
                <label className="field"><span>Type DELETE to confirm</span><input value={typed} autoCapitalize="characters" autoComplete="off" onChange={e => setTyped(e.target.value)} /></label>
                {error && <p role="alert" className="error"><AlertCircle size={15} /> {error}</p>}
                <div className="modal-actions">
                    <button className="secondary" disabled={busy} onClick={() => setDeleting(false)}>Keep my account</button>
                    <button className="danger" disabled={busy || typed.trim() !== 'DELETE'} onClick={async () => {
                        setBusy(true);
                        setError('');
                        try {
                            await p.deleteAccount();
                        } catch (e) {
                            setError(e instanceof Error ? e.message : 'Your account could not be deleted. Nothing was removed; please retry.');
                            setBusy(false);
                        }
                    }}>{busy ? 'Deleting…' : 'Permanently delete'}</button>
                </div>
            </div>}
        </div>
    </section>;
}
