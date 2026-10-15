'use client';
import { api, platform } from '../platform';
import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileUp, RefreshCw } from 'lucide-react';
import type { StateSummary } from '../../lib/student-data';

const MAX_BYTES = 3_000_000;
type Preview = { document: unknown; fileName: string; summary: StateSummary; warnings: string[]; exportedAt: string | null; current: { version: number; summary: StateSummary } };

const rows: [keyof StateSummary, string][] = [['courses', 'Class meetings'], ['deadlines', 'Deadlines'], ['books', 'Textbooks'], ['gradeCourses', 'Grade records'], ['plannerCourses', 'Planner courses'], ['studyBlocks', 'Study blocks'], ['flashcards', 'Flashcards'], ['studySessions', 'Study sessions']];

function hasData(s: StateSummary) {
    return !!s.university || rows.some(([k]) => Number(s[k]) > 0);
}

/** Settings → Import data. Validates on the server, previews, then replaces only after explicit confirmation. */
export default function DataImport({ onImported, onSessionExpired }: { onImported: () => void; onSessionExpired: () => void }) {
    const input = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(''), [confirmed, setConfirmed] = useState(false);

    async function send(body: unknown) {
        const r = await api('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await r.json().catch(() => ({})) as Record<string, unknown>;
        if (r.status === 401) onSessionExpired();
        if (!r.ok) throw Object.assign(Error(typeof data.error === 'string' ? data.error : 'The import could not finish.'), { status: r.status });
        return data;
    }

    function reset() {
        setPreview(null);
        setConfirmed(false);
        if (input.current) input.current.value = '';
    }

    async function choose(file: File | undefined) {
        setError('');
        setDone('');
        reset();
        if (!file) return;
        if (file.size > MAX_BYTES) return setError('This file is larger than 3 MB, which is bigger than any valid CampusOS export.');
        setBusy(true);
        try {
            let document: unknown;
            try {
                document = JSON.parse(await file.text());
            } catch {
                throw Error('This file is not valid JSON. Choose the campusos-data.json file you downloaded from CampusOS.');
            }
            const data = await send({ mode: 'preview', document });
            setPreview({ document, fileName: file.name, ...(data as Omit<Preview, 'document' | 'fileName'>) });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not read this file.');
            if (input.current) input.current.value = '';
        } finally {
            setBusy(false);
        }
    }

    async function replace() {
        if (!preview) return;
        setBusy(true);
        setError('');
        try {
            await send({ mode: 'replace', confirm: true, expectedVersion: preview.current.version, document: preview.document });
            setDone(`Imported ${preview.fileName}. Your CampusOS data now matches the file.`);
            reset();
            onImported();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'The import could not finish. Your existing data is unchanged.');
            if ((e as { status?: number }).status === 409) reset();
        } finally {
            setBusy(false);
        }
    }

    const replacing = preview && hasData(preview.current.summary);
    return <section className="panel">
        <h2>Bring your data over</h2>
        <p className="helper">Import a <strong>campusos-data.json</strong> file from <em>Settings → Download my data</em>. Importing <strong>replaces</strong> your entire CampusOS profile, classes, deadlines, textbooks, grades, planner and study tools with the file’s contents; nothing is merged. It never imports accounts, passwords or Google Calendar access. Reconnect Google Calendar separately afterwards.</p>
        <div className="import-file">
            <button type="button" className="secondary" onClick={() => void platform().downloadApi('/api/export', 'campusos-data.json').catch(e => setError(e instanceof Error ? e.message : 'Could not download your data.'))}><Download size={16} />Download my current data first</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => input.current?.click()}><FileUp size={16} />{busy && !preview ? 'Checking…' : 'Choose export file'}</button>
            <input ref={input} type="file" accept="application/json,.json" hidden aria-label="CampusOS export file" onChange={e => void choose(e.target.files?.[0])} />
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        {done && <p role="status" className="success-note" style={{ marginTop: 15 }}><CheckCircle2 size={17} />{done}</p>}
        {preview && <div className="book-notice">
            <strong>{preview.fileName}</strong>{preview.exportedAt && <> · exported {new Date(preview.exportedAt).toLocaleString()}</>}
            <p>{preview.summary.university ? `${preview.summary.name ?? 'Student'} · ${preview.summary.university} · ${preview.summary.semester}` : 'No profile in this file.'}</p>
            <div className="import-summary">{rows.map(([k, label]) => <div key={k}><strong>{preview.summary[k]}</strong><span>{label}{replacing ? ` · now ${preview.current.summary[k]}` : ''}</span></div>)}</div>
            {preview.warnings.map(w => <p key={w} className="warning"><AlertCircle size={16} />{w}</p>)}
            {replacing && <p className="warning"><AlertCircle size={16} />Your account already has data ({preview.current.summary.university ?? 'no profile'}, {preview.current.summary.courses} class meetings, {preview.current.summary.deadlines} deadlines). It will be replaced. Download it first if you might need it.</p>}
            <label className="check-label" style={{ marginTop: 14 }}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />I understand this replaces all of my current CampusOS data with this file.</label>
            <div className="modal-actions"><button className="secondary" disabled={busy} onClick={reset}>Cancel</button><button className="danger" disabled={busy || !confirmed} onClick={replace}>{busy ? <><RefreshCw size={16} />Importing…</> : 'Replace my data'}</button></div>
        </div>}
    </section>;
}
