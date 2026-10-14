'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock, Download, FileText, Flag, Plus, Search, Sparkles, Trash2, Upload, X, Pencil } from 'lucide-react';
import type { State } from '../lib/model';
import { clock, dayOf, localDate } from '../lib/model';
import { Deadline, deadlineSchema, deadlineKinds, Grading, gradingSchema, daysUntil, upcoming, mergeDeadlines, duplicateKey } from '../lib/deadlines';
import type { Candidate, Extraction } from '../lib/syllabus-parser';
import { extractPdf } from '../lib/pdf-text';
function Field({ label, children }: {
    label: string;
    children: React.ReactNode;
}) { return <label className="field"><span>{label}</span>{children}</label>; }
const newDeadline = (date: string): Deadline => ({ id: crypto.randomUUID(), title: '', date, time: '', courseCode: '', kind: 'homework', weight: null, notes: '', source: '', done: false, updatedAt: new Date().toISOString() });
function dateLabel(date: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00Z')); }
function dueLabel(d: Deadline, today: string) { const n = daysUntil(d.date, today); return n < 0 ? `${-n}d overdue` : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`; }
export function DeadlineOverview({ state, today, onOpen, onQuick }: {
    state: State;
    today: string;
    onOpen: () => void;
    onQuick: (text: string) => void;
}) {
    const [quick, Q] = useState('');
    const list = upcoming(state.deadlines, today).slice(0, 5);
    const exam = state.deadlines.filter(d => !d.done && ['exam', 'paper'].includes(d.kind) && daysUntil(d.date, today) >= 0 && daysUntil(d.date, today) <= 14).sort((a, b) => a.date.localeCompare(b.date))[0];
    return <section className="panel deadline-overview"><div className="section-head"><h2>On the horizon</h2><span className="outline-pill">NEXT 7 DAYS</span></div>{list.length ? <div className="mini-deadlines">{list.map(d => <button key={d.id} onClick={onOpen}><span className={`deadline-dot ${d.kind}`}/><div><strong>{d.title}</strong><small>{d.courseCode || 'Campus'} · {dueLabel(d, today)}</small></div>{d.weight !== null && <span className="weight-chip">{d.weight}%</span>}</button>)}</div> : <div className="deadline-empty"><CalendarDays size={25}/><h3>A little more peace of mind.</h3><p>{state.deadlines.length ? 'Nothing open in the next seven days.' : 'Import a syllabus or add a deadline to bring your semester into focus.'}</p></div>}{exam && <p className="study-nudge"><Sparkles size={15}/><span>{exam.title} is {daysUntil(exam.date, today) === 0 ? 'today' : `in ${daysUntil(exam.date, today)} days`}{exam.weight !== null ? ` and worth ${exam.weight}% of your grade` : ''}. {daysUntil(exam.date, today) > 0 ? 'Make time to review.' : 'You’ve got this.'}</span></p>}{dayOf(today) === 0 && <p className="study-nudge"><Flag size={15}/><span>Sunday review: {upcoming(state.deadlines, today).filter(d => daysUntil(d.date, today) >= 0).length} deadlines in the coming week. Check your schedule and plan your study time.</span></p>}<form className="quick-add" onSubmit={e => {
            e.preventDefault();
            if (quick.trim())
                onQuick(quick.trim());
        }}><label htmlFor="quick-deadline">Get it out of your head</label><div><input id="quick-deadline" required maxLength={500} value={quick} onChange={e => Q(e.target.value)} placeholder="essay due friday for english"/><button aria-label="Review quick deadline" className="icon"><ArrowRight size={18}/></button></div><small>Review the date before it’s saved.</small></form><button className="text-button" onClick={onOpen}>Open deadline timeline<ArrowRight size={15}/></button></section>;
}
type ReviewRow = Candidate & {
    id: string;
    selected: boolean;
    courseCode: string;
};
export default function DeadlineWorkspace({ state, save, busy, initialQuick = '' }: {
    state: State;
    save: (next: State) => Promise<boolean>;
    busy: boolean;
    initialQuick?: string;
}) {
    const today = localDate(new Date(), state.profile!.timezone);
    const [page, Page] = useState(initialQuick ? 'import' : 'timeline'), [inputKind, InputKind] = useState<'syllabus' | 'quickadd'>(initialQuick ? 'quickadd' : 'syllabus'), [text, Text] = useState(initialQuick), [importCourse, ImportCourse] = useState(''), [parsing, Parsing] = useState(false), [progress, Progress] = useState(''), [error, ErrorText] = useState(''), [notice, Notice] = useState(''), [rows, Rows] = useState<ReviewRow[]>([]), [warnings, Warnings] = useState<string[]>([]), [grading, GradingRows] = useState<Extraction['grading']>([]), [includeGrading, IncludeGrading] = useState(true), [confirmed, Confirmed] = useState(false), [edit, Edit] = useState<Deadline | null>(null), [filter, Filter] = useState('open'), [course, Course] = useState(''), [search, SearchText] = useState(''), [includeClasses, IncludeClasses] = useState(true), [exporting, Exporting] = useState(false), [aiAvailable, AI] = useState(false), [parseMode, ParseMode] = useState('basic'), [pendingDelete, PendingDelete] = useState<string | null>(null);
    const courseCodes = Array.from(new Set([...state.courses.map(c => c.code), ...state.deadlines.map(d => d.courseCode), ...state.grading.map(g => g.courseCode)])).filter(Boolean);
    useEffect(() => {
        fetch('/api/parse').then(r => r.json() as Promise<{
            aiAvailable?: boolean;
        }>).then(r => AI(!!r.aiAvailable)).catch(() => AI(false));
    }, []);
    function changePage(p: string) { Page(p); ErrorText(''); Notice(''); PendingDelete(null); }
    async function readFile(file: File) {
        ErrorText('');
        Parsing(true);
        try {
            if (file.name.toLowerCase().endsWith('.pdf'))
                Text(await extractPdf(file, Progress));
            else if (file.name.toLowerCase().endsWith('.txt')) {
                if (file.size > 200000)
                    throw Error('Choose a text file under 200 KB.');
                const value = await file.text();
                if (value.length > 100000)
                    throw Error('Paste fewer than 100,000 characters.');
                Text(value);
            }
            else
                throw Error('Choose a .pdf or .txt file.');
            Notice('File read. Check the extracted text, then find deadlines.');
        }
        catch (e) {
            ErrorText(e instanceof Error ? e.message : 'Could not read file. Paste text instead.');
        }
        finally {
            Parsing(false);
            Progress('');
        }
    }
    async function parse() {
        ErrorText('');
        Notice('');
        Parsing(true);
        Progress(aiAvailable ? 'Finding dates and grading details…' : 'Finding explicit dates…');
        try {
            const response = await fetch('/api/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: inputKind, text, courseCode: importCourse, useAI: aiAvailable }) });
            const result = await response.json() as Extraction & {
                mode: string;
                courseCode: string;
                error?: string;
            };
            if (!response.ok)
                throw Error(result.error || 'Parsing failed');
            Rows(result.items.map(r => ({ ...r, id: crypto.randomUUID(), courseCode: result.courseCode, selected: !!r.date })));
            GradingRows(result.grading);
            Warnings(result.warnings);
            ImportCourse(result.courseCode);
            ParseMode(result.mode);
            Confirmed(false);
            Page('review');
        }
        catch (e) {
            ErrorText(e instanceof Error ? e.message : 'Parsing failed. Please try manual entry.');
        }
        finally {
            Parsing(false);
            Progress('');
        }
    }
    async function importReviewed() {
        ErrorText('');
        if (!confirmed) {
            ErrorText('Confirm that you reviewed your selected items.');
            return;
        }
        const selected = rows.filter(r => r.selected);
        const parsed = selected.map(r => deadlineSchema.safeParse({ id: r.id, title: r.title, date: r.date, time: r.time, kind: r.kind, weight: r.weight, courseCode: r.courseCode, source: r.source, notes: r.note, done: false, updatedAt: new Date().toISOString() }));
        const invalid = parsed.find(r => !r.success);
        if (invalid && !invalid.success) {
            ErrorText(invalid.error.issues[0].message);
            return;
        }
        const values = parsed.flatMap(r => r.success ? [r.data] : []);
        let nextGrading = state.grading;
        if (includeGrading && grading.length) {
            if (!importCourse) {
                ErrorText('Choose a course for grading categories, or uncheck their import.');
                return;
            }
            const incoming: Grading[] = [];
            for (const g of grading) {
                const parsed = gradingSchema.safeParse({ ...g, id: crypto.randomUUID(), courseCode: importCourse });
                if (!parsed.success) {
                    ErrorText('Check the grading category names and percentages.');
                    return;
                }
                incoming.push(parsed.data);
            }
            nextGrading = [...state.grading.filter(g => !incoming.some(n => n.courseCode === g.courseCode && n.category.toLowerCase() === g.category.toLowerCase())), ...incoming];
        }
        const merged = mergeDeadlines(state.deadlines, values);
        if (await save({ ...state, deadlines: merged.deadlines, grading: nextGrading })) {
            Page('timeline');
            Rows([]);
            Text('');
            Notice(`${merged.added} deadline${merged.added === 1 ? '' : 's'} added${merged.skipped ? `; ${merged.skipped} exact duplicates skipped` : ''}.`);
        }
    }
    async function saveManual() {
        if (!edit)
            return;
        const checked = deadlineSchema.safeParse({ ...edit, updatedAt: new Date().toISOString() });
        if (!checked.success) {
            ErrorText(checked.error.issues[0].message);
            return;
        }
        if (await save({ ...state, deadlines: state.deadlines.some(d => d.id === edit.id) ? state.deadlines.map(d => d.id === edit.id ? checked.data : d) : [...state.deadlines, checked.data] })) {
            Edit(null);
            Page('timeline');
            Notice('Deadline saved.');
        }
    }
    async function download() {
        Exporting(true);
        ErrorText('');
        try {
            const r = await fetch('/api/calendar?classes=' + (includeClasses ? '1' : '0'));
            if (!r.ok) {
                const a = await r.json() as {
                    error: string;
                };
                throw Error(a.error);
            }
            const url = URL.createObjectURL(await r.blob());
            const a = document.createElement('a');
            a.href = url;
            a.download = 'CampusOS-semester.ics';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
            Notice(`Calendar downloaded with ${r.headers.get('X-CampusOS-Event-Count') || ''} events.`);
        }
        catch (e) {
            ErrorText(e instanceof Error ? e.message : 'Export failed.');
        }
        finally {
            Exporting(false);
        }
    }
    const shown = state.deadlines.filter(d => (!course || d.courseCode === course) && (!search || `${d.title} ${d.courseCode}`.toLowerCase().includes(search.toLowerCase())) && (filter === 'done' ? d.done : filter === 'all' ? true : !d.done) && (filter !== 'week' || daysUntil(d.date, today) >= 0 && daysUntil(d.date, today) <= 7) && (filter !== 'overdue' || d.date < today)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const setRow = (id: string, change: Partial<ReviewRow>) => Rows(rows.map(r => r.id === id ? { ...r, ...change } : r));
    const back = () => {
        if (page === 'review')
            Page('import');
        else {
            Page('timeline');
            Edit(null);
        }
        ErrorText('');
    };
    return <div className="deadlines-workspace"><datalist id="course-codes">{courseCodes.map(c => <option key={c} value={c}/>)}</datalist><div className="page-heading"><div><p className="eyebrow">{state.profile!.semester.toUpperCase()} · STAY A STEP AHEAD</p><h1>{page === 'review' ? 'A quick double-check.' : page === 'manual' ? (state.deadlines.some(d => d.id === edit?.id) ? 'Edit your deadline.' : 'Make a note of it.') : page === 'import' ? 'From syllabus to clarity.' : page === 'export' ? 'Take your plan with you.' : 'Deadlines, under control.'}</h1><p className="muted">{page === 'timeline' ? 'One timeline for every course. A little less to keep in your head.' : page === 'review' ? 'Fix dates, remove extra rows, and confirm what belongs on your calendar.' : 'Your dates follow ' + state.profile!.timezone.replaceAll('_', ' ') + '.'}</p></div>{page === 'timeline' ? <div className="row deadline-actions"><button className="secondary" onClick={() => changePage('export')}><Download size={16}/>Export</button><button className="primary" onClick={() => { InputKind('syllabus'); changePage('import'); }}><Upload size={16}/>Import syllabus</button></div> : <button className="text-button" disabled={parsing || busy} onClick={back}><ArrowLeft size={16}/>Back</button>}</div>{error && <p role="alert" className="error banner">{error}</p>}{notice && <p className="success-note" role="status"><CheckCircle2 size={16}/>{notice}</p>}
    {page === 'timeline' ? <><div className="deadline-summary"><div><span className="stat-icon mint"><Flag size={20}/></span><strong>{state.deadlines.filter(d => !d.done && daysUntil(d.date, today) >= 0 && daysUntil(d.date, today) <= 7).length}</strong><small>due this week</small></div><div><span className="stat-icon peach"><Clock size={20}/></span><strong>{state.deadlines.filter(d => !d.done && d.date < today).length}</strong><small>overdue</small></div><div><span className="stat-icon blue"><CheckCircle2 size={20}/></span><strong>{state.deadlines.filter(d => d.done).length}</strong><small>completed</small></div></div><section className="panel"><div className="section-head"><h2>Your semester timeline</h2><button className="text-button" onClick={() => { Edit(newDeadline(today)); changePage('manual'); }}><Plus size={17}/>Add manually</button></div><div className="deadline-filters"><label className="search-wrap"><Search size={17}/><input aria-label="Search deadlines" placeholder="Search your deadlines" value={search} onChange={e => SearchText(e.target.value)}/></label><select aria-label="Filter deadlines by course" value={course} onChange={e => Course(e.target.value)}><option value="">All courses</option>{courseCodes.map(c => <option key={c}>{c}</option>)}</select></div><div className="filter-chips">{[['open', 'Open'], ['week', 'Next 7 days'], ['overdue', 'Overdue'], ['done', 'Completed'], ['all', 'All']].map(([value, label]) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => Filter(value)}>{label}</button>)}</div>{shown.length ? <div className="deadline-list">{shown.map(d => <article key={d.id} className={`deadline-row ${d.done ? 'is-done' : ''}`}><button className={`complete-toggle ${d.done ? 'checked' : ''}`} aria-label={`${d.done ? 'Reopen' : 'Complete'} ${d.title}`} disabled={busy} onClick={() => save({ ...state, deadlines: state.deadlines.map(x => x.id === d.id ? { ...x, done: !x.done, updatedAt: new Date().toISOString() } : x) })}>{d.done && <Check size={15}/>}</button><div className="deadline-body"><div className="deadline-meta"><span className={`kind-pill ${d.kind}`}>{d.kind}</span><span>{d.courseCode || 'Campus / personal'}</span>{d.weight !== null && <span className="weight-chip">{d.weight}% of grade</span>}</div><h3>{d.title}</h3><p className={d.date < today && !d.done ? 'overdue-text' : ''}>{dateLabel(d.date)}{d.time ? ' · ' + clock(d.time) : ' · No time specified'} {!d.done && ' · ' + dueLabel(d, today)}</p>{(d.notes || d.source) && <details><summary>Notes & source</summary>{d.notes && <p>{d.notes}</p>}{d.source && <blockquote>{d.source}</blockquote>}</details>}{pendingDelete === d.id && <div className="delete-inline"><span>Remove this deadline?</span><button disabled={busy} onClick={async () => {
                            if (await save({ ...state, deadlines: state.deadlines.filter(x => x.id !== d.id) }))
                                PendingDelete(null);
                        }}>Remove</button><button onClick={() => PendingDelete(null)}>Keep</button></div>}</div><div className="row"><button className="icon" aria-label={`Edit ${d.title}`} onClick={() => { Edit(d); changePage('manual'); }}><Pencil size={15}/></button><button className="icon" aria-label={`Remove ${d.title}`} onClick={() => PendingDelete(d.id)}><Trash2 size={15}/></button></div></article>)}</div> : <div className="empty"><FileText size={30}/><h3>{state.deadlines.length ? 'Nothing in this view' : 'Your syllabus has a lot to say.'}</h3><p>{state.deadlines.length ? 'Try a different filter or add a deadline.' : 'Upload a PDF, paste syllabus text, or add a deadline by hand. You’ll review every extracted date before saving.'}</p><button className="secondary" onClick={() => { InputKind('syllabus'); changePage('import'); }}>Import your first syllabus<ArrowRight size={16}/></button></div>}</section>{state.grading.length > 0 && <section className="panel grading-panel"><h2>Saved grading breakdowns</h2><p className="muted">Category percentages are separate from individual assignment weights.</p><div className="grading-tags">{state.grading.map(g => <span key={g.id}>{g.courseCode} · {g.category}<strong>{g.weight}%</strong><button disabled={busy} className="icon" aria-label={`Remove ${g.category} grading category`} onClick={() => save({ ...state, grading: state.grading.filter(x => x.id !== g.id) })}><X size={13}/></button></span>)}</div></section>}</> : page === 'import' ? <section className="panel import-panel"><div className="import-tabs"><button className={inputKind === 'syllabus' ? 'selected' : ''} onClick={() => InputKind('syllabus')}><FileText size={17}/>Syllabus PDF / text</button><button className={inputKind === 'quickadd' ? 'selected' : ''} onClick={() => InputKind('quickadd')}><Sparkles size={17}/>Quick add</button></div><div className="form-grid"><Field label="Course · optional for campus dates"><input list="course-codes" maxLength={50} value={importCourse} onChange={e => ImportCourse(e.target.value)} placeholder="Choose or type a course code"/></Field>{inputKind === 'syllabus' && <label className="upload-zone"><Upload size={25}/><strong>Bring your syllabus</strong><span>Choose a PDF or text file · PDF up to 5 MB / 60 pages</span><input disabled={parsing} type="file" accept="application/pdf,text/plain,.pdf,.txt" onChange={e => {
                    if (e.target.files?.[0])
                        void readFile(e.target.files[0]);
                    e.target.value = '';
                }}/></label>}<Field label={inputKind === 'syllabus' ? 'Or paste / review the extracted text' : 'What’s coming up?'}><textarea rows={inputKind === 'syllabus' ? 11 : 3} maxLength={100000} value={text} onChange={e => Text(e.target.value)} placeholder={inputKind === 'syllabus' ? 'October 20: Midterm — 25% of final grade\nNovember 6: Research paper due at 11:59 PM\nHomework 20%' : 'essay due friday for english'}/></Field><div className="parser-note"><Sparkles size={17}/><div><strong>{aiAvailable ? 'AI parsing available' : 'Basic date extraction'}</strong><p>{aiAvailable ? 'Extracted text is sent to OpenAI for parsing. You’ll review the results before saving.' : 'Finds explicit dates and percentages. Complex tables and recurring rules may need manual entry. AI parsing is not configured.'}</p><p>The PDF stays on your device; only extracted text is sent. Scanned PDFs need pasted text or manual entry.</p></div></div><div className="modal-actions"><button className="secondary" disabled={parsing} onClick={() => { Edit(newDeadline(today)); changePage('manual'); }}>Add manually</button><button className="primary" disabled={parsing || text.trim().length < 3} onClick={parse}>{parsing ? progress || 'Reading…' : 'Find deadlines'}<ArrowRight size={17}/></button></div></div></section> : page === 'review' ? <><div className="review-intro"><span className="outline-pill">{parseMode === 'ai' ? 'AI EXTRACTED' : 'BASIC EXTRACTION'}</span><strong>{rows.length} candidate items</strong><small>{rows.filter(r => !r.date).length} need a date · unchecked items won’t be saved</small></div>{warnings.map((w, i) => <p className="warning" key={i}>{w}</p>)}{!rows.length && <p className="warning">No dated items found. Go back and try a smaller excerpt, or add deadlines manually.</p>}<form onSubmit={e => { e.preventDefault(); void importReviewed(); }}><div className="review-list">{rows.map((r, index) => <section className={`panel review-row ${!r.selected ? 'excluded' : ''}`} key={r.id}><div className="section-head"><label className="check-label"><input type="checkbox" checked={r.selected} onChange={e => setRow(r.id, { selected: e.target.checked })}/>Include item {index + 1}</label><button type="button" className="icon" aria-label={`Discard candidate ${index + 1}`} onClick={() => Rows(rows.filter(x => x.id !== r.id))}><X size={17}/></button></div><div className="form-grid"><Field label="Title"><input required={r.selected} maxLength={200} value={r.title} onChange={e => setRow(r.id, { title: e.target.value })}/></Field><div className="two"><Field label="Date"><input required={r.selected} type="date" value={r.date} onChange={e => setRow(r.id, { date: e.target.value })}/></Field><Field label="Time · blank = unspecified"><input type="time" value={r.time} onChange={e => setRow(r.id, { time: e.target.value })}/></Field></div><div className="review-three"><Field label="Course"><input list="course-codes" maxLength={50} value={r.courseCode} onChange={e => setRow(r.id, { courseCode: e.target.value })}/></Field><Field label="Type"><select value={r.kind} onChange={e => setRow(r.id, { kind: e.target.value as Deadline['kind'] })}>{deadlineKinds.map(k => <option key={k}>{k}</option>)}</select></Field><Field label="This item’s grade weight %"><input type="number" min="0" max="100" step="0.01" value={r.weight ?? ''} onChange={e => setRow(r.id, { weight: e.target.value === '' ? null : Number(e.target.value) })}/></Field></div>{r.note && <p className="review-note">{r.note}</p>}<blockquote className="source-quote">{r.source}</blockquote>{state.deadlines.some(d => duplicateKey(d) === duplicateKey(r)) && <p className="review-note">An exact match already exists. It will be skipped.</p>}</div></section>)}</div>{grading.length > 0 && <section className="panel grading-panel"><label className="check-label"><input type="checkbox" checked={includeGrading} onChange={e => IncludeGrading(e.target.checked)}/>Save grading breakdown</label><p className="helper">These are category totals, not individual assignment weights. Matching saved categories will be updated.</p><Field label="Course for these categories"><input list="course-codes" maxLength={50} required={includeGrading} value={importCourse} onChange={e => ImportCourse(e.target.value)}/></Field>{grading.map((g, i) => <div className="grading-edit" key={i}><Field label="Category"><input value={g.category} required={includeGrading} onChange={e => GradingRows(grading.map((x, j) => i === j ? { ...x, category: e.target.value } : x))}/></Field><Field label="Weight %"><input type="number" min="0" max="100" step="0.01" required={includeGrading} value={g.weight} onChange={e => GradingRows(grading.map((x, j) => i === j ? { ...x, weight: Number(e.target.value) } : x))}/></Field><button type="button" className="icon" aria-label={`Remove category ${g.category}`} onClick={() => GradingRows(grading.filter((_, j) => j !== i))}><X size={17}/></button></div>)}<p className="helper">Listed total: {grading.reduce((sum, g) => sum + g.weight, 0)}%. Check against the syllabus; partial breakdowns may be below 100%.</p></section>}<div className="review-save panel"><label className="check-label"><input type="checkbox" required checked={confirmed} onChange={e => Confirmed(e.target.checked)}/>I checked the selected dates, years, times, and weights against my source.</label><button className="primary" disabled={busy || !confirmed || (!rows.some(r => r.selected) && !(includeGrading && grading.length))}>{busy ? 'Saving…' : `Save ${rows.filter(r => r.selected).length} deadlines`}<Check size={17}/></button></div></form></> : page === 'manual' && edit ? <section className="panel import-panel"><form onSubmit={e => { e.preventDefault(); void saveManual(); }}><div className="form-grid"><Field label="Title"><input autoFocus required maxLength={200} value={edit.title} onChange={e => Edit({ ...edit, title: e.target.value })} placeholder="e.g. CS midterm"/></Field><div className="two"><Field label="Course · optional"><input list="course-codes" maxLength={50} value={edit.courseCode} onChange={e => Edit({ ...edit, courseCode: e.target.value })}/></Field><Field label="Type"><select value={edit.kind} onChange={e => Edit({ ...edit, kind: e.target.value as Deadline['kind'] })}>{deadlineKinds.map(k => <option key={k}>{k}</option>)}</select></Field></div><div className="two"><Field label="Due date"><input type="date" required value={edit.date} onChange={e => Edit({ ...edit, date: e.target.value })}/></Field><Field label="Time · optional"><input type="time" value={edit.time} onChange={e => Edit({ ...edit, time: e.target.value })}/></Field></div><Field label="Individual grade weight % · optional"><input type="number" min="0" max="100" step="0.01" value={edit.weight ?? ''} onChange={e => Edit({ ...edit, weight: e.target.value === '' ? null : Number(e.target.value) })}/><small>Enter this assignment’s weight, not the total for its category.</small></Field><Field label="Notes"><textarea rows={3} maxLength={2000} value={edit.notes} onChange={e => Edit({ ...edit, notes: e.target.value })}/></Field><div className="modal-actions"><button type="button" className="secondary" onClick={back}>Cancel</button><button disabled={busy} className="primary">{busy ? 'Saving…' : 'Save deadline'}<Check size={17}/></button></div></div></form></section> : page === 'export' ? <section className="panel import-panel export-panel"><span className="round-icon"><Download /></span><h2>One file. Your whole plan.</h2><p className="muted">Download an .ics file for Apple Calendar, Outlook, Google Calendar, and other compatible apps.</p><div className="export-count"><strong>{state.deadlines.filter(d => !d.done).length}</strong><span>open deadlines</span></div><label className="check-label"><input type="checkbox" checked={includeClasses} onChange={e => IncludeClasses(e.target.checked)}/>Include class meetings for the full semester</label><div className="export-details"><p><CheckCircle2 size={16}/>Exams & papers: reminders 1 week and 1 day before.</p><p><CheckCircle2 size={16}/>Other deadlines: reminder 1 day before.</p><p><Clock size={16}/>Times use your campus timezone, including daylight saving.</p></div><p className="helper">Untimed deadlines become all-day events. Class meetings are exported as dated events; holidays aren’t excluded automatically. Calendar apps may handle imported alerts differently.</p><p className="helper">This is a snapshot, not a live sync. Import into a separate CampusOS calendar; replace that calendar when re-exporting to avoid duplicates or stale events. For live Google sync, open Calendar Sync from the navigation.</p><div className="modal-actions"><button disabled={exporting} className="primary" onClick={download}><Download size={17}/>{exporting ? 'Preparing…' : 'Download .ics'}</button></div></section> : null}</div>;
}
