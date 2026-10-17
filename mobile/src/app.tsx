import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AlertCircle, CheckCircle2, CloudOff, Download, GraduationCap, RefreshCw } from 'lucide-react';
import CampusApp from '../../shared/ui/campus-app';
import { platform, setPlatform } from '../../shared/platform';
import { exportDocument } from '../../lib/student-data';
import type { OfflineStore, SyncStatus } from '../../lib/offline-sync';
import type { State } from '../../lib/model';
import { config } from './config';
import { supabase } from './supabase';
import { createNativePlatform, type SignedOutReason } from './native-platform';
import { AuthScreens, UpdatePassword, signedOutNotices, type AuthNotice, type AuthScreen } from './auth';
import { permission, reminderPrefs, setReminderPrefs, type ReminderPrefs } from './notifications';
import { forgetAccountTheme } from '../../lib/theme/runtime';

/** Accepts only this app's two auth callback forms and returns the PKCE code, if any. */
export function parseAuthCallback(raw: string): { code?: string; error?: string; next?: string } | null {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    const scheme = url.protocol === 'campusos:' && url.host === 'auth' && url.pathname === '/callback';
    const universal = url.origin === config.apiOrigin && url.pathname === '/auth/mobile-callback';
    if (!scheme && !universal) return null;
    const p = url.searchParams;
    return { code: p.get('code') ?? undefined, error: p.get('error_description') ?? p.get('error') ?? undefined, next: p.get('next') === 'update-password' ? 'update-password' : undefined };
}

function SyncBanner({ store }: { store: OfflineStore }) {
    const [s, setS] = useState<SyncStatus>(store.status());
    useEffect(() => store.onStatus(setS), [store]);
    const when = s.lastSynced ? new Date(s.lastSynced).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
    if (s.mode === 'conflict') return <div role="alert" className="warning banner sync-banner"><span><AlertCircle size={16} /> {s.message} Choose which copy to keep. Nothing has been overwritten yet.</span><div className="row">
        <button className="secondary" onClick={() => { const p = store.pending(); if (p) void platform().saveFile('campusos-offline-edits.json', JSON.stringify(exportDocument(p.state), null, 2), 'application/json'); }}><Download size={15} />Save a copy of my offline edits</button>
        <button className="secondary" onClick={() => void store.resolveConflict('server')}>Keep the newer saved version</button>
        <button className="danger" onClick={() => void store.resolveConflict('mine')}>Replace it with this iPhone’s edits</button>
    </div></div>;
    if (s.mode === 'offline') return <div role="status" className="warning banner sync-banner"><span><CloudOff size={16} /> Offline. Showing the copy saved on this iPhone (last synced {when}).{s.pending ? ' Your edits are saved here and will sync when you reconnect.' : ''} Syllabus parsing, the planner and Calendar sync need a connection.</span>{s.pending && <button className="secondary" onClick={() => void store.sync()}><RefreshCw size={15} />Try again</button>}</div>;
    if (s.mode === 'syncing') return <div role="status" className="success-note banner"><RefreshCw size={16} /> Syncing edits made on this iPhone…</div>;
    return null;
}

function DeviceSettings({ store, state }: { store: OfflineStore; state: () => State | null }) {
    const [prefs, setPrefs] = useState<ReminderPrefs | null>(null), [perm, setPerm] = useState(''), [status, setStatus] = useState<SyncStatus>(store.status());
    useEffect(() => { void reminderPrefs().then(setPrefs); void permission().then(setPerm); return store.onStatus(setStatus); }, [store]);
    const update = async (next: ReminderPrefs) => { setPrefs(next); setPerm(await setReminderPrefs(next, state())); };
    return <section className="panel">
        <h2>On this iPhone</h2>
        <p className="helper">Reminders are scheduled on this iPhone only, from your saved deadlines and the focus timer. They don’t use push notifications or send data anywhere.</p>
        {prefs && <div className="form-grid" style={{ marginTop: 14 }}>
            <label className="check-label"><input type="checkbox" checked={prefs.deadlines} onChange={e => void update({ ...prefs, deadlines: e.target.checked })} />Deadline reminders (exams and papers 1 week and 1 day before; others 1 day before)</label>
            <label className="check-label"><input type="checkbox" checked={prefs.timer} onChange={e => void update({ ...prefs, timer: e.target.checked })} />Notify me when a focus or break timer ends</label>
        </div>}
        {perm === 'denied' && (prefs?.deadlines || prefs?.timer) && <p className="warning"><AlertCircle size={16} />Notifications are turned off for CampusOS. Turn them on in the iOS Settings app → CampusOS → Notifications.</p>}
        <p className="helper">A copy of your data is stored on this iPhone, encrypted, so schedules and flashcards work offline. Last synced: {status.lastSynced ? new Date(status.lastSynced).toLocaleString() : 'not yet'}.{status.pending ? ' Some edits haven’t synced yet.' : ''} Signing out erases it.</p>
    </section>;
}

function SignedIn({ session, onSignedOut, onChangePassword }: { session: Session; onSignedOut(reason: SignedOutReason, message?: string): void; onChangePassword(): void }) {
    const user = session.user;
    const providers = (user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider as string].filter(Boolean);
    const native = useMemo(() => {
        const created = createNativePlatform({ userId: user.id, providers, onSignedOut, onChangePassword });
        setPlatform(created.platform);
        return created;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user.id]);
    useEffect(() => native.dispose, [native]);
    const [latest, setLatest] = useState<State | null>(null);
    useEffect(() => native.store.subscribe(l => setLatest(l.state)), [native]);
    const name = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.split(' ')[0] : '';
    return <CampusApp key={user.id} userId={user.id} displayName={name} email={user.email ?? null} banner={<SyncBanner store={native.store} />} settingsExtras={<DeviceSettings store={native.store} state={() => latest ?? native.store.pending()?.state ?? null} />} />;
}

export default function MobileApp() {
    const [session, setSession] = useState<Session | null | undefined>(undefined);
    const [screen, setScreen] = useState<AuthScreen>('login'), [notice, setNotice] = useState<AuthNotice>({}), [noticeKey, setNoticeKey] = useState(0);
    const [updatingPassword, setUpdatingPassword] = useState(false);
    const show = (n: AuthNotice) => { setNotice(n); setNoticeKey(k => k + 1); };

    useEffect(() => {
        void supabase.auth.getSession().then(({ data }) => setSession(data.session));
        const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
            setSession(s);
            if (event === 'PASSWORD_RECOVERY') setUpdatingPassword(true);
        });
        const handle = async (raw: string) => {
            const parsed = parseAuthCallback(raw);
            if (!parsed) return;
            await Browser.close().catch(() => undefined);
            if (parsed.error || !parsed.code) return show(signedOutNotices[parsed.error ? 'oauth_failed' : 'link_expired']);
            const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
            if (error) return show(signedOutNotices.link_expired);
            if (parsed.next === 'update-password') setUpdatingPassword(true);
        };
        const opened = CapApp.addListener('appUrlOpen', e => void handle(e.url));
        void CapApp.getLaunchUrl().then(l => { if (l?.url) void handle(l.url); });
        return () => { sub.subscription.unsubscribe(); void opened.then(h => h.remove()); };
    }, []);

    // Keep the bottom navigation out of the keyboard's way.
    useEffect(() => {
        const listeners = [Keyboard.addListener('keyboardWillShow', () => document.body.classList.add('keyboard-open')), Keyboard.addListener('keyboardWillHide', () => document.body.classList.remove('keyboard-open'))];
        return () => listeners.forEach(l => void l.then(h => h.remove()));
    }, []);

    // Signed out (including an expired session): the sign-in screens use the CampusOS palette, never the last
    // student's school colors. The device's Light/Dark/System choice stays.
    useEffect(() => { if (session === null) forgetAccountTheme(); }, [session]);

    // Status bar text: light over dark surfaces (dark theme, or the deep brand header on sign-in/onboarding),
    // dark otherwise. Re-evaluated when the screen or the theme changes.
    useEffect(() => {
        let last = '';
        const apply = () => {
            const dark = document.documentElement.getAttribute('data-theme') === 'dark' || !!document.querySelector('.setup-aside');
            const next = dark ? Style.Dark : Style.Light;
            if (next !== last) { last = next; void StatusBar.setStyle({ style: next }).catch(() => undefined); }
        };
        const observer = new MutationObserver(apply);
        observer.observe(document.body, { childList: true, subtree: true });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        apply();
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!session || !notice.info) return;
        const t = setTimeout(() => setNotice({}), 4000);
        return () => clearTimeout(t);
    }, [session, notice.info]);

    if (session === undefined) return <main className="loading"><div className="brand"><span className="brand-icon"><GraduationCap /></span>Campus<span>OS</span></div><h2>Getting your campus ready…</h2></main>;
    if (session && updatingPassword) return <UpdatePassword email={session.user.email ?? null} onDone={() => { setUpdatingPassword(false); show({ info: 'Your password was updated.' }); }} />;
    if (!session) return <AuthScreens key={noticeKey} screen={screen} setScreen={setScreen} notice={notice} />;
    return <>
        {notice.info && <div className="toast" role="status"><CheckCircle2 size={18} />{notice.info}</div>}
        <SignedIn session={session} onChangePassword={() => setUpdatingPassword(true)} onSignedOut={(reason, message) => { setScreen('login'); setSession(null); show(message ? { ...signedOutNotices[reason], error: message } : signedOutNotices[reason]); }} />
    </>;
}
