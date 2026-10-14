'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCircle2, Clock, ExternalLink, Link2, LockKeyhole, RefreshCw, ShieldCheck, Unplug, AlertCircle } from 'lucide-react';
import type { State } from '../lib/model';
import type { SyncAction } from '../lib/google-events';
type Status = {
    configured: boolean;
    connected: boolean;
    email: string | null;
    calendarId: string | null;
    calendarStatus: string;
    lastSynced: string | null;
    lastError: string | null;
    busy: boolean;
    redirectUri: string;
};
type Preview = {
    id: string;
    expires: number;
    actions: SyncAction[];
    unchanged: number;
    batchSize: number;
    version: number;
};
const callbackMessages: Record<string, string> = { connected: 'Google connected. Create your dedicated CampusOS calendar, then review your first sync.', declined: 'Google permission was declined. Your CampusOS data is unchanged.', invalid_state: 'The Google connection request expired or could not be verified. Start a new connection.', failed: 'Google authorization could not finish. Check the app setup and try again.', permissions_missing: 'Calendar permission was not granted. Reconnect and approve the requested Calendar access.', different_account: 'Use the same Google account previously linked to this CampusOS profile. No account was switched.', refresh_missing: 'Google did not provide offline access. Reconnect and approve access again.', sign_in_required: 'Sign in to CampusOS, then reconnect Google Calendar.' };
export default function CalendarSync({ state, onExport }: {
    state: State;
    onExport: () => void;
}) {
    const [status, Status] = useState<Status | null>(null), [loading, Loading] = useState(true), [busy, Busy] = useState(false), [error, E] = useState(''), [message, M] = useState(''), [consent, Consent] = useState(false), [classes, Classes] = useState(true), [deadlines, Deadlines] = useState(true), [preview, Preview] = useState<Preview | null>(null), [confirmed, Confirmed] = useState(false), [disconnect, Disconnect] = useState(false), [recover, Recover] = useState(''), [noCalendar, NoCalendar] = useState(false), [tick, Tick] = useState(Date.now());
    async function refresh() { try {
        const r = await fetch('/api/google/status');
        const data = await r.json() as Status & {
            error?: string;
        };
        if (!r.ok)
            throw Error(data.error);
        Status(data);
    }
    catch (e) {
        E(e instanceof Error ? e.message : 'Unable to read calendar connection.');
    }
    finally {
        Loading(false);
    } }
    useEffect(() => { void refresh(); const params = new URLSearchParams(window.location.search), result = params.get('calendar'); if (result) {
        M(callbackMessages[result] || 'Google connection returned. Check the status below.');
        params.delete('calendar');
        window.history.replaceState({}, '', window.location.pathname + (params.size ? '?' + params.toString() : ''));
    } const timer = setInterval(() => Tick(Date.now()), 10000); return () => clearInterval(timer); }, []);
    useEffect(() => { Preview(null); Confirmed(false); }, [classes, deadlines, state]);
    async function post(path: string, body: unknown) { const r = await fetch('/api/google/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await r.json() as Record<string, unknown>; if (!r.ok)
        throw Error(typeof data.error === 'string' ? data.error : 'The calendar action failed.'); return data; }
    async function createCalendar(recoverId?: string) { Busy(true); E(''); M(''); try {
        await post('calendar', { confirm: true, ...(recoverId ? { recoverId } : {}) });
        M(recoverId ? 'Calendar recovered. You can review your sync.' : 'Your CampusOS calendar is ready. Review the events before syncing.');
        await refresh();
    }
    catch (e) {
        E(e instanceof Error ? e.message : 'Calendar creation failed.');
        await refresh();
    }
    finally {
        Busy(false);
    } }
    async function resetCreation() { Busy(true); E(''); try {
        await post('calendar', { confirm: true, resetUncertain: true });
        M('Creation reset. You can create a new CampusOS calendar.');
        NoCalendar(false);
        await refresh();
    }
    catch (e) {
        E(e instanceof Error ? e.message : 'Reset failed.');
    }
    finally {
        Busy(false);
    } }
    async function getPreview() { Busy(true); E(''); M(''); Preview(null); Confirmed(false); try {
        const r = await post('preview', { classes, deadlines });
        Preview(r as unknown as Preview);
        await refresh();
    }
    catch (e) {
        E(e instanceof Error ? e.message : 'Could not build the preview.');
    }
    finally {
        Busy(false);
    } }
    async function sync() { if (!preview)
        return; Busy(true); E(''); M(''); try {
        const result = await post('sync', { planId: preview.id, confirm: true });
        M(`${Number(result.completed) || 0} changes confirmed. ${String(result.message ?? '')}`);
        if (!result.ok)
            E('The batch stopped. Refresh the preview before retrying; completed changes are preserved.');
        Preview(null);
        Confirmed(false);
        await refresh();
    }
    catch (e) {
        E(e instanceof Error ? e.message : 'Sync was not confirmed. Refresh the preview to reconcile.');
        Preview(null);
        Confirmed(false);
        await refresh();
    }
    finally {
        Busy(false);
    } }
    async function disconnectNow() { Busy(true); E(''); M(''); try {
        const result = await post('disconnect', { confirm: true });
        M(String(result.message));
        Disconnect(false);
        Preview(null);
        await refresh();
    }
    catch (e) {
        E(e instanceof Error ? e.message : 'Could not disconnect.');
    }
    finally {
        Busy(false);
    } }
    const expired = !!preview && preview.expires < tick, openDeadlines = state.deadlines.filter(d => !d.done);
    return <div className="calendar-workspace"><div className="page-heading"><div><p className="eyebrow">YOUR PLAN, WHERE YOU NEED IT</p><h1>Make time for your semester.</h1><p className="muted">Connect Google Calendar and bring your classes and deadlines along.</p></div><button className="secondary" onClick={onExport}><CalendarDays size={17}/>Use .ics instead</button></div>{error && <p role="alert" className="error banner">{error}</p>}{message && <p role="status" className="success-note"><CheckCircle2 size={17}/>{message}</p>}<section className="calendar-connect panel"><div className="google-mark" aria-hidden="true"><CalendarDays size={29}/></div><div className="calendar-connect-text"><div className="section-head"><h2>Google Calendar</h2><span className={`connection-pill ${status?.connected ? 'connected' : ''}`}>{loading ? 'Checking…' : status?.connected ? 'CONNECTED' : status?.configured ? 'NOT CONNECTED' : 'SETUP PENDING'}</span></div><p>{status?.connected ? status.email : 'A dedicated calendar for the rhythm of college life.'}</p>{status?.lastSynced && <small>Last complete sync: {new Date(status.lastSynced).toLocaleString()}</small>}</div><button className="icon" aria-label="Refresh connection status" disabled={busy} onClick={() => { E(''); void refresh(); }}><RefreshCw size={18}/></button></section>{loading ? <div className="empty"><Clock size={28}/><p>Checking your calendar connection…</p></div> : !status ? <section className="panel"><h2>Couldn’t load the connection</h2><button className="secondary" onClick={() => { Loading(true); void refresh(); }}>Try again</button></section> : <><div className="calendar-layout"><section className="panel calendar-main"><div className="step-heading"><span>01</span><div><h2>{status.connected ? 'Your Google connection' : 'Connect on your terms'}</h2><p>You choose the account and approve access.</p></div></div>{!status.configured ? <div className="setup-pending"><AlertCircle size={23}/><h3>One-time Google setup is needed.</h3><p>The app owner needs to configure a Google OAuth client before connections can open. Your classes and deadlines are ready; .ics export works now.</p><details><summary>App owner setup details</summary><p>Enable Google Calendar API and create a Google OAuth Web application client. Add this exact authorized redirect URI:</p><code>{status.redirectUri}</code><p>Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as private server runtime values, then redeploy. No secret should be entered in chat or placed in browser code.</p><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Open Google Cloud credentials<ExternalLink size={13}/></a></details></div> : !status.connected ? <><div className="permission-note"><ShieldCheck size={22}/><div><strong>Just your CampusOS calendar</strong><p>Google will ask permission to create app calendars and manage events on them, plus identify your Google account. Your primary calendar isn’t used by this integration.</p></div></div><form method="POST" action="/api/google/oauth/start" target="_top"><label className="check-label"><input name="consent" value="yes" type="checkbox" required checked={consent} onChange={e => Consent(e.target.checked)}/>I want to connect Google and grant CampusOS the permissions described above.</label><button className="primary google-connect-button" disabled={!consent || busy}><Link2 size={17}/>Continue to Google<ArrowRight size={16}/></button></form>{status.email && <p className="helper">Reconnect using {status.email} to keep the existing calendar and event links.</p>}</> : <div className="connected-note"><CheckCircle2 size={20}/><p>Connected as <strong>{status.email}</strong>. Your approval on the next steps controls calendar creation and sync.</p></div>}
        <div className="step-heading"><span>02</span><div><h2>A home for your campus life</h2><p>Keep your college schedule together.</p></div></div>{status.calendarId ? <div className="ready-calendar"><CalendarDays size={25}/><div><strong>CampusOS</strong><small>Dedicated Google calendar</small></div><a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noreferrer" className="text-button">Open Google<ExternalLink size={14}/></a></div> : status.calendarStatus === 'uncertain' || status.calendarStatus === 'creating' ? <div className="warning calendar-recover"><p>Google didn’t confirm whether a calendar was created. Check Google Calendar before creating another. If you see “CampusOS,” open Settings → Integrate calendar and copy its Calendar ID.</p><label className="field"><span>CampusOS Calendar ID</span><input value={recover} maxLength={500} onChange={e => Recover(e.target.value)} placeholder="…@group.calendar.google.com"/></label><button className="secondary" disabled={busy || !recover.trim() || !status.connected} onClick={() => createCalendar(recover.trim())}>Verify and recover calendar</button><label className="check-label"><input type="checkbox" checked={noCalendar} onChange={e => NoCalendar(e.target.checked)}/>I checked this Google account and no CampusOS calendar was created.</label><button className="text-button" disabled={busy || !noCalendar || !status.connected} onClick={resetCreation}>Allow a fresh creation attempt</button></div> : <><p className="calendar-help">Create a private calendar named CampusOS in your connected account. This step creates the calendar only; no events are added yet.</p><button className="secondary" disabled={!status.connected || busy || !status.configured} onClick={() => createCalendar()}><PlusCalendar />Create CampusOS calendar</button></>}
        <div className="step-heading"><span>03</span><div><h2>Review, then sync</h2><p>See every create, update, and removal first.</p></div></div><div className="sync-options"><label className="sync-option"><input type="checkbox" checked={classes} onChange={e => Classes(e.target.checked)} disabled={busy}/><CalendarDays size={20}/><div><strong>Weekly classes</strong><small>{state.courses.length} meeting patterns · recurring through semester end</small></div></label><label className="sync-option"><input type="checkbox" checked={deadlines} onChange={e => Deadlines(e.target.checked)} disabled={busy}/><Clock size={20}/><div><strong>Open deadlines</strong><small>{openDeadlines.length} deadlines · reminders included</small></div></label></div><p className="helper">Unchecked groups stay unchanged in Google. For selected groups, completed or deleted CampusOS items are removed from the dedicated calendar. Edits made directly to managed Google events are replaced when you approve an update.</p><button className="primary review-sync-button" disabled={busy || !status.connected || !status.calendarId || (!classes && !deadlines)} onClick={getPreview}><RefreshCw size={17}/>{busy ? 'Working…' : 'Preview sync changes'}</button></section><aside className="calendar-side"><section className="panel"><span className="round-icon"><Clock /></span><h2>A heads-up, right on time.</h2><div className="reminder-spec"><span className="kind-pill exam">EXAMS & PAPERS</span><strong>1 week + 1 day before</strong><p>Time to prepare, then a final nudge.</p></div><div className="reminder-spec"><span className="kind-pill homework">OTHER DEADLINES</span><strong>1 day before</strong><p>A reminder before your work is due.</p></div><p className="helper">Reminders appear through Google Calendar. Enable Calendar notifications on your devices. Items with no due time become all-day events.</p></section><section className="sync-principles"><LockKeyhole size={23}/><h3>Always in your control.</h3><p>CampusOS keeps Google tokens on the server. Connecting doesn’t send events automatically.</p><p>Sync runs when you approve it. After editing your CampusOS schedule, preview and sync again.</p></section></aside></div>{preview && <section className="panel sync-preview"><div className="section-head"><div><p className="eyebrow">CHECK YOUR CHANGES</p><h2>{preview.actions.length ? 'Ready when you are.' : 'Everything matches.'}</h2></div><span className="outline-pill">{expired ? 'PREVIEW EXPIRED' : 'VALID FOR 5 MINUTES'}</span></div><div className="sync-counts"><span><strong>{preview.actions.filter(a => a.op === 'create').length}</strong>create</span><span><strong>{preview.actions.filter(a => a.op === 'update').length}</strong>update</span><span><strong>{preview.actions.filter(a => a.op === 'remove').length}</strong>remove</span><span><strong>{preview.unchanged}</strong>unchanged</span></div>{preview.actions.length > 0 && <><div className="sync-action-list">{preview.actions.map(a => <div key={a.key}><span className={`sync-op ${a.op}`}>{a.op}</span><div><strong>{a.title}</strong><small>{a.key.startsWith('class:') ? 'Recurring class series' : 'Deadline'}{a.body?.start.date ? ' · ' + a.body.start.date : ''}{a.body?.start.dateTime ? ' · ' + new Intl.DateTimeFormat('en-US', { timeZone: state.profile!.timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(a.body.start.dateTime)) : ''}</small></div></div>)}</div><p className="helper">Each approval sends up to {preview.batchSize} changes. If more remain, review another batch. A class removal affects its entire series; no invitations are sent.</p><div className="review-save"><label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => Confirmed(e.target.checked)} disabled={busy || expired}/>I approve these changes to my CampusOS Google calendar.</label><button className="primary" disabled={busy || !confirmed || expired} onClick={sync}><Check size={17}/>{busy ? 'Syncing…' : `Sync ${Math.min(preview.actions.length, preview.batchSize)} changes`}</button></div></>}{expired && <p className="warning">This preview expired. Create a fresh preview before syncing.</p>}</section>}{status.connected && <section className="panel disconnect-panel"><div><h3>Disconnect Google Calendar</h3><p>Stop future access. Your existing Google calendar and events remain.</p></div>{disconnect ? <div className="row"><button className="secondary" disabled={busy} onClick={() => Disconnect(false)}>Keep connected</button><button className="danger" disabled={busy} onClick={disconnectNow}>Disconnect & revoke</button></div> : <button className="secondary" disabled={busy} onClick={() => Disconnect(true)}><Unplug size={16}/>Disconnect</button>}</section>}</>}</div>;
}
function PlusCalendar() { return <CalendarDays size={17}/>; }
