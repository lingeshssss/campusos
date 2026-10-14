'use client';
import { useEffect, useState } from 'react';
import DeadlineWorkspace, { DeadlineOverview } from './deadline-workspace';
import CalendarSync from './calendar-sync';
import GradeWorkspace from './grade-workspace';
import PlannerWorkspace from './planner-workspace';
import StudyWorkspace, { StudyOverview } from './study-workspace';
import { defaultStudy } from '../lib/study';
import { defaultPlanner } from '../lib/planner';
import { defaultGpa } from '../lib/grades';
import TextbookWorkspace, { TextbookReminder } from './textbook-workspace';
import { ArrowRight, ArrowLeft, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, GraduationCap, LayoutDashboard, MapPin, Plus, Settings, Sun, Trash2, X, Pencil, ArrowUpRight, CheckCircle2, LogOut, AlertCircle, Sparkles, Layers } from 'lucide-react';
import { Course, Profile, State, profileSchema, courseSchema, clock, minutes, leaveTime, conflicts, localDate, dayOf, addDays } from '../lib/model';
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const colors = ['mint', 'blue', 'peach', 'purple'] as const;
const emptyCourse = (): Course => ({ id: crypto.randomUUID(), code: '', title: '', section: '', days: [], start: '10:00', end: '11:20', building: '', room: '', professor: '', travel: 15, color: 'mint' });
function initialProfile(name: string): Profile { const year = new Date().getFullYear(), fall = new Date().getMonth() >= 6; return { name, university: '', domain: '', majors: '', minors: '', graduation: year + 4, semester: `${fall ? 'Fall' : 'Spring'} ${year}`, start: `${year}-${fall ? '09-01' : '01-15'}`, end: `${year}-${fall ? '12-20' : '05-15'}`, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' }; }
function Label({ text, children }: {
    text: string;
    children: React.ReactNode;
}) { return <label className="field"><span>{text}</span>{children}</label>; }
function ProfileForm({ p, set, step }: {
    p: Profile;
    set: (p: Profile) => void;
    step: number;
}) {
    const [query, Q] = useState(p.university);
    const [results, R] = useState<{
        name: string;
        domain: string;
    }[]>([]);
    const [open, O] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        const t = setTimeout(() => {
            if (open)
                fetch('/api/universities?q=' + encodeURIComponent(query), { signal: controller.signal }).then(r => r.json() as Promise<{
                    name: string;
                    domain: string;
                }[]>).then(R).catch(() => R([]));
        }, 180);
        return () => { clearTimeout(t); controller.abort(); };
    }, [query, open]);
    const field = (k: keyof Profile, v: string | number) => set({ ...p, [k]: v });
    return <div className="form-grid">{step === 0 ? <><Label text="What should we call you?"><input required autoComplete="given-name" placeholder="Your first name" value={p.name} onChange={e => field('name', e.target.value)}/></Label><div className="field university"><span>Your university</span><div className="search-wrap"><GraduationCap size={19}/><input aria-label="Search U.S. universities" placeholder="Search 2,349 U.S. universities…" value={query} onFocus={() => O(true)} onChange={e => { Q(e.target.value); O(true); field('university', e.target.value); }}/></div>{open && <div className="results">{results.map((u, i) => <button type="button" key={u.domain + i} onClick={() => { set({ ...p, university: u.name, domain: u.domain }); Q(u.name); O(false); }}><strong>{u.name}</strong><small>{u.domain}</small></button>)}{!results.length && <p>No matches. Enter your school's name and domain below.</p>}<button type="button" onClick={() => O(false)}>Close results</button></div>}</div><Label text="University domain"><input required placeholder="e.g. rutgers.edu" value={p.domain} onChange={e => field('domain', e.target.value)}/><small>Saved for future campus-specific information. Can't find your school? Enter its name and domain manually.</small></Label></> : <><Label text="Major(s)"><input required placeholder="e.g. Computer Science, Mathematics" value={p.majors} onChange={e => field('majors', e.target.value)}/></Label><div className="two"><Label text="Minor(s) · optional"><input placeholder="e.g. Business" value={p.minors} onChange={e => field('minors', e.target.value)}/></Label><Label text="Graduation year"><input required type="number" min="2020" max="2100" value={p.graduation} onChange={e => field('graduation', Number(e.target.value))}/></Label></div><Label text="Semester name"><input required value={p.semester} onChange={e => field('semester', e.target.value)}/></Label><div className="two"><Label text="Semester starts"><input required type="date" value={p.start} onChange={e => field('start', e.target.value)}/></Label><Label text="Semester ends"><input required type="date" min={p.start} value={p.end} onChange={e => field('end', e.target.value)}/></Label></div><Label text="Campus timezone"><select value={p.timezone} onChange={e => field('timezone', e.target.value)}>{Array.from(new Set([p.timezone, 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Pacific/Guam', 'America/Puerto_Rico', 'UTC'])).map(t => <option key={t}>{t}</option>)}</select><small>Classes follow local campus time, including daylight saving changes. Confirm your official semester dates.</small></Label></>}</div>;
}
function CourseEditor({ course, all, onSave, onClose, busy }: {
    course: Course;
    all: Course[];
    onSave: (c: Course) => void;
    onClose: () => void;
    busy: boolean;
}) {
    const [c, S] = useState(course);
    const [error, E] = useState('');
    const field = (k: keyof Course, v: unknown) => S({ ...c, [k]: v });
    const overlaps = conflicts(c, all);
    return <div className="overlay" onClick={e => {
            if (e.target === e.currentTarget && !busy)
                onClose();
        }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="course-title"><header className="section-head"><div><p className="eyebrow">MAKE ROOM FOR WHAT'S NEXT</p><h2 id="course-title">{all.some(x => x.id === c.id) ? 'Edit class' : 'Add a class'}</h2></div><button disabled={busy} className="icon" aria-label="Close class editor" onClick={onClose}><X /></button></header><form onSubmit={e => {
            e.preventDefault();
            const result = courseSchema.safeParse(c);
            if (!result.success) {
                E(result.error.issues[0].message);
                return;
            }
            E('');
            onSave(result.data);
        }}><div className="form-grid"><div className="two"><Label text="Course code"><input autoFocus required placeholder="CS 111" value={c.code} onChange={e => field('code', e.target.value)}/></Label><Label text="Section · optional"><input placeholder="01" value={c.section} onChange={e => field('section', e.target.value)}/></Label></div><Label text="Course name"><input required placeholder="Introduction to Computer Science" value={c.title} onChange={e => field('title', e.target.value)}/></Label><div className="field"><span>Meets on</span><div className="day-buttons">{days.map((d, i) => <button aria-pressed={c.days.includes(i)} type="button" className={c.days.includes(i) ? 'selected' : ''} key={d} onClick={() => field('days', c.days.includes(i) ? c.days.filter(x => x !== i) : [...c.days, i])}>{d}</button>)}</div></div><div className="two"><Label text="Start time"><input type="time" required value={c.start} onChange={e => field('start', e.target.value)}/></Label><Label text="End time"><input type="time" required value={c.end} onChange={e => field('end', e.target.value)}/></Label></div><div className="two"><Label text="Building · optional"><input placeholder="e.g. Tillett Hall" value={c.building} onChange={e => field('building', e.target.value)}/></Label><Label text="Room · optional"><input placeholder="Room 101" value={c.room} onChange={e => field('room', e.target.value)}/></Label></div><Label text="Professor · optional"><input placeholder="Professor's name" value={c.professor} onChange={e => field('professor', e.target.value)}/></Label><div className="two"><Label text="Travel time (minutes)"><input type="number" required min="0" max="180" value={c.travel} onChange={e => field('travel', Number(e.target.value))}/><small>Your estimate, used for “leave by.”</small></Label><div className="field"><span>Class color</span><div className="swatches">{colors.map(x => <button key={x} aria-label={x} aria-pressed={c.color === x} type="button" className={`swatch ${x} ${c.color === x ? 'picked' : ''}`} onClick={() => field('color', x)}>{c.color === x && <Check size={16}/>}</button>)}</div></div></div></div>{overlaps.length > 0 && <p className="warning"><AlertCircle size={16}/> Overlaps with {overlaps.map(x => x.code).join(', ')}. You can save, but check your registration.</p>}{error && <p role="alert" className="error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy} className="primary">{busy ? 'Saving…' : 'Save class'}<Check size={17}/></button></div></form></section></div>;
}
function CourseCard({ c, onEdit, onDelete }: {
    c: Course;
    onEdit: () => void;
    onDelete: () => void;
}) { return <article className={`course-card ${c.color}`}><div className="section-head"><span className="tag">{c.code}{c.section && ` · ${c.section}`}</span><div className="row"><button className="icon" aria-label={`Edit ${c.code}`} onClick={onEdit}><Pencil size={16}/></button><button className="icon" aria-label={`Delete ${c.code}`} onClick={onDelete}><Trash2 size={16}/></button></div></div><h3>{c.title}</h3><p><Clock size={14}/>{c.days.slice().sort().map(d => days[d]).join(', ')} · {clock(c.start)}–{clock(c.end)}</p><p><MapPin size={14}/>{[c.building, c.room].filter(Boolean).join(' · ') || 'Room not added yet'}</p>{c.professor && <small>{c.professor}</small>}</article>; }
export default function CampusApp({ displayName }: {
    displayName: string;
}) {
    const [quickText, QuickText] = useState('');
    const [state, S] = useState<State | null>(null), [version, V] = useState(0), [error, E] = useState(''), [busy, B] = useState(false), [view, T] = useState('Today'), [step, Step] = useState(0), [profile, P] = useState<Profile>(() => initialProfile(displayName)), [draft, D] = useState<Course[]>([]), [editor, Editor] = useState<Course | null>(null), [toast, Toast] = useState(''), [now, N] = useState(new Date()), [offset, Offset] = useState(0), [deleteId, Delete] = useState<string | null>(null);
    const load = () => {
        E('');
        fetch('/api/state').then(async (r) => {
            const a = await r.json() as {
                state: State;
                version: number;
                error?: string;
            };
            if (!r.ok)
                throw Error(a.error);
            S(a.state);
            V(a.version);
            if (a.state.profile)
                P(a.state.profile);
        }).catch(e => E(e.message));
    };
    useEffect(() => { if (new URLSearchParams(window.location.search).has('calendar'))
        T('Calendar sync'); load(); const t = setInterval(() => N(new Date()), 30000); return () => clearInterval(t); }, []);
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => Toast(''), 4000);
            return () => clearTimeout(t);
        }
    }, [toast]);
    async function save(next: State) {
        B(true);
        E('');
        try {
            const r = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: next, version }) });
            const a = await r.json() as {
                version: number;
                error?: string;
            };
            if (!r.ok)
                throw Error(a.error);
            S(next);
            V(a.version);
            Toast('All changes saved');
            return true;
        }
        catch (e) {
            E(e instanceof Error ? e.message : 'Unable to save');
            return false;
        }
        finally {
            B(false);
        }
    }
    useEffect(() => {
        if (!editor && !deleteId)
            return;
        const previous = document.activeElement as HTMLElement | null;
        const dialog = document.querySelector<HTMLElement>('[role=dialog],[role=alertdialog]');
        const background = document.querySelector<HTMLElement>('.app-shell,.setup');
        if (background)
            background.inert = true;
        const oldOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const selector = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]';
        const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(selector) ?? []);
        focusable()[0]?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) {
                Editor(null);
                Delete(null);
            }
            if (e.key === 'Tab') {
                const items = focusable(), first = items[0], last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                }
                else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = oldOverflow;
            if (background)
                background.inert = false;
            previous?.focus();
        };
    }, [!!editor, !!deleteId, busy]);
    const onboarding = state && !state.profile;
    const courses = onboarding ? draft : state?.courses ?? [];
    const today = localDate(now, profile.timezone), date = addDays(today, offset), dow = dayOf(date), inTerm = date >= profile.start && date <= profile.end;
    const daily = courses.filter(c => c.days.includes(dow) && inTerm).sort((a, b) => a.start.localeCompare(b.start));
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: profile.timezone, hour: 'numeric', hourCycle: 'h23' }).format(now));
    const nowMinutes = minutes(new Intl.DateTimeFormat('en-GB', { timeZone: profile.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now));
    const next = daily.find(c => minutes(c.end) > nowMinutes);
    const weeklyMinutes = courses.reduce((sum, c) => sum + (minutes(c.end) - minutes(c.start)) * c.days.length, 0);
    async function saveCourse(c: Course) {
        const all = courses.some(x => x.id === c.id) ? courses.map(x => x.id === c.id ? c : x) : [...courses, c];
        if (onboarding) {
            D(all);
            Editor(null);
        }
        else if (state && await save({ ...state, courses: all }))
            Editor(null);
    }
    async function remove() {
        if (onboarding) {
            D(courses.filter(c => c.id !== deleteId));
            Delete(null);
        }
        else if (state && await save({ ...state, courses: courses.filter(c => c.id !== deleteId) }))
            Delete(null);
    }
    function goto(s: string) {
        T(s);
        E('');
        Offset(0);
        if (state?.profile)
            P(state.profile);
    }
    if (!state)
        return <main className="loading"><div className="brand"><span className="brand-icon"><GraduationCap /></span>Campus<span>OS</span></div><h2>{error ? 'Let’s reconnect.' : 'Getting your campus ready…'}</h2><p>{error || 'Loading your personal space.'}</p>{error && <button className="primary" onClick={load}>Try again</button>}</main>;
    return <>{onboarding ? <div className="setup"><aside className="setup-aside"><a className="brand" href="/"><span className="brand-icon"><GraduationCap /></span>Campus<span>OS</span></a><div><p className="eyebrow">LESS JUGGLING. MORE LIVING.</p><h1>Your campus.<br />Your rhythm.<br /><em>All together.</em></h1><p>A little setup now. A clearer day, every day.</p><div className="setup-art"><div className="art-orbit"/><GraduationCap size={72} strokeWidth={1}/><span className="art-note"><CheckCircle2 size={16}/> A little more organized.</span></div></div><small>Made for the beautifully busy college life.</small></aside><main className="setup-main"><div className="setup-top"><span>YOUR CAMPUS STARTS HERE</span><span>STEP {step + 1} OF 3</span></div><div className="progress">{[0, 1, 2].map(i => <span key={i} className={i <= step ? 'active' : ''}/>)}</div><div className="setup-content"><span className="round-icon">{step === 0 ? <GraduationCap /> : step === 1 ? <BookOpen /> : <CalendarDays />}</span><h1>{['First, find your people.', 'A plan that fits you.', 'Let’s map out your week.'][step]}</h1><p className="muted">{['Tell us where you study. We’ll make this space yours.', 'Add your studies and confirm your semester dates.', 'Add your classes manually. You can edit them any time.'][step]}</p><form onSubmit={async (e) => {
                e.preventDefault();
                E('');
                if (step === 0) {
                    if (!profile.name.trim() || !profile.university.trim() || !/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(profile.domain)) {
                        E('Enter your name, university, and a valid school domain.');
                        return;
                    }
                    Step(1);
                }
                else if (step === 1) {
                    const p = profileSchema.safeParse(profile);
                    if (!p.success) {
                        E(p.error.issues[0].message);
                        return;
                    }
                    Step(2);
                }
                else if (await save({ profile, courses: draft, deadlines: [], grading: [], books: [], gradeCourses: [], gpaSettings: defaultGpa(), planner: defaultPlanner(), study: defaultStudy() })) {
                    T('Today');
                }
            }}>{step < 2 ? <ProfileForm p={profile} set={P} step={step}/> : <><div className="manual-note"><Pencil size={18}/><div><strong>Manual entry</strong><small>Paste and screenshot import are planned for a later phase.</small></div></div><div className="draft-courses">{draft.map(c => <CourseCard key={c.id} c={c} onEdit={() => Editor(c)} onDelete={() => Delete(c.id)}/>)}</div><button type="button" className="add-class" onClick={() => Editor(emptyCourse())}><Plus size={20}/> Add {draft.length ? 'another' : 'your first'} class</button><p className="helper">Have a lab or discussion? Add it as a separate meeting. You can also start with an empty schedule.</p></>}{error && <p role="alert" className="error">{error}</p>}<div className="setup-actions">{step > 0 ? <button disabled={busy} type="button" className="text-button" onClick={() => Step(step - 1)}><ArrowLeft size={16}/>Back</button> : <span />}<button disabled={busy} className="primary">{busy ? 'Saving…' : step === 2 ? 'Go to my dashboard' : 'Continue'}<ArrowRight size={17}/></button></div></form></div><p className="setup-foot"><CheckCircle2 size={14}/>Your setup saves securely when you finish. Only you can access it.</p></main></div> : <div className="app-shell"><aside className="sidebar"><a href="/" className="brand"><span className="brand-icon"><GraduationCap /></span>Campus<span>OS</span></a><div className="campus-name"><GraduationCap size={19}/><div><strong>{state.profile!.university}</strong><small>{state.profile!.semester}</small></div></div><p className="nav-caption">YOUR EVERYDAY</p><nav>{[{ n: 'Today', icon: LayoutDashboard }, { n: 'My schedule', icon: CalendarDays }, { n: 'Deadlines', icon: BookOpen }, { n: 'Study', icon: Sparkles }, { n: 'Planner', icon: CalendarDays }, { n: 'Grades', icon: Layers }, { n: 'Textbooks', icon: BookOpen }, { n: 'Calendar sync', icon: Clock }, { n: 'My campus', icon: GraduationCap }].map(({ n, icon: Icon }) => <button key={n} className={view === n ? 'active' : ''} onClick={() => goto(n)}><Icon size={20}/>{n}{view === n && <span className="nav-dot"/>}</button>)}</nav><div className="sidebar-note"><span className="tiny-pill">GROWING WITH YOU</span><h3>A little less on your mind.</h3><p>Your semester, one day at a time.</p><div className="sprout">✳</div></div><button className="settings-link" onClick={() => goto('Settings')}><Settings size={19}/>Settings</button><div className="user"><span className="avatar">{profile.name.slice(0, 1).toUpperCase()}</span><div><strong>{profile.name}</strong><small>Class of {profile.graduation}</small></div><a href="/signout-with-chatgpt?return_to=%2F" target="_top" aria-label="Sign out"><LogOut size={17}/></a></div></aside><main className="main"><header className="topbar"><span>My workspace <span className="slash">/</span> <strong>{view}</strong></span><div className="row"><span className="private"><span />Personal space</span><span className="avatar small">{profile.name.slice(0, 1).toUpperCase()}</span></div></header><div className="content">{error && <div role="alert" className="error banner">{error}</div>}{view === 'Today' ? <><div className="page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat('en-US', { timeZone: profile.timezone, weekday: 'long', month: 'long', day: 'numeric' }).format(now).toUpperCase()}</p><h1>Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, {profile.name}. <Sun className="sun" size={32}/></h1><p className="muted">A fresh perspective on everything ahead.</p></div><button className="primary" onClick={() => Editor(emptyCourse())}><Plus size={18}/>Add a class</button></div><section className="hero"><div className="hero-text"><span className="tiny-pill">{daily.length ? 'YOUR DAY, IN FOCUS' : 'MAKE SPACE FOR YOURSELF'}</span><h2>{daily.length ? `${daily.length} class${daily.length === 1 ? '' : 'es'}. You've got this.` : inTerm ? 'A little breathing room.' : 'Between semesters.'}</h2><p>{daily.length ? 'Your next steps, neatly in one place. Take the day one class at a time.' : inTerm ? 'No classes on your schedule today. Recharge, catch up, or make a little progress.' : 'Your classes will appear here during your configured semester.'}</p><button className="hero-link" onClick={() => goto('My schedule')}>See your week <ArrowRight size={17}/></button></div><div className="hero-art" aria-hidden="true"><div className="orbit o1"/><div className="orbit o2"/><span className="float-star">✳</span><div className="paper"><div className="paper-top">THE DAILY PLAN <Sun size={15}/></div><div className="paper-line"><span className="paper-check">✓</span><i /></div><div className="paper-line"><span className="paper-check">✓</span><i /></div><div className="paper-line"><span className="paper-check empty"/><i /></div><span className="paper-bottom">One thing at a time.</span></div><div className="sticker"><Check size={19}/> You’re on your way</div></div></section><div className="stats"><div><span className="stat-icon mint"><CalendarDays size={20}/></span><div><strong>{daily.length}<small>today</small></strong><p>Classes on your calendar</p></div></div><div><span className="stat-icon blue"><Clock size={20}/></span><div><strong>{(weeklyMinutes / 60).toFixed(1)}<small>hrs / week</small></strong><p>Scheduled class time</p></div></div><div><span className="stat-icon peach"><BookOpen size={20}/></span><div><strong>{new Set(courses.map(c => c.code)).size}<small>courses</small></strong><p>This semester’s lineup</p></div></div></div><div className="dashboard-grid"><section className="panel"><header className="section-head"><div><h2>Today’s classes <span className="count">{daily.length}</span></h2><p>Your campus, one stop at a time.</p></div><button className="text-button" onClick={() => goto('My schedule')}>Full schedule<ArrowUpRight size={15}/></button></header>{daily.length ? <div className="timeline">{daily.map(c => { const past = minutes(c.end) <= nowMinutes, live = minutes(c.start) <= nowMinutes && !past; return <div className={`timeline-row ${past ? 'past' : ''}`} key={c.id}><div className="time-col"><strong>{clock(c.start)}</strong><span>{clock(c.end)}</span></div><div className={`class-event ${c.color}`}><div className="section-head"><span className="course-code">{c.code}{c.section && ` · ${c.section}`}</span><span className="status">{past ? 'DONE' : live ? 'IN PROGRESS' : next?.id === c.id ? 'UP NEXT' : ''}</span></div><h3>{c.title}</h3><p><MapPin size={14}/>{[c.building, c.room].filter(Boolean).join(' · ') || 'Add a building and room'}</p><footer><span>{c.professor || 'Professor not added'}</span><span><Clock size={13}/>Leave by {leaveTime(c)}</span></footer></div></div>; })}</div> : <div className="empty"><CalendarDays size={30}/><h3>{courses.length ? 'No classes today' : 'A clear day starts with a plan'}</h3><p>{courses.length ? 'Take a look at your week to see what’s coming up.' : 'Add your first class with its days, time, and room. Your daily plan will appear here.'}</p><button className="secondary" onClick={() => courses.length ? goto('My schedule') : Editor(emptyCourse())}>{courses.length ? 'See this week' : 'Add your first class'}<ArrowRight size={16}/></button></div>}<div className="panel-foot"><MapPin size={14}/>Leave-by times use your travel estimates, not live routes.</div></section><div className="right-column"><StudyOverview state={state} today={localDate(now, profile.timezone)} onOpen={() => goto('Study')}/><TextbookReminder state={state} today={localDate(now, profile.timezone)} onOpen={() => goto('Textbooks')}/><DeadlineOverview state={state} today={today} onOpen={() => { QuickText(''); goto('Deadlines'); }} onQuick={text => { QuickText(text); goto('Deadlines'); }}/><section className="campus-card"><span className="eyebrow">YOUR HOME BASE</span><GraduationCap size={28}/><h3>{profile.university}</h3><p>{profile.majors} · {profile.graduation}</p><button className="text-button" onClick={() => goto('My campus')}>View campus details<ArrowUpRight size={16}/></button></section></div></div><p className="bottom-note">A little structure. A lot more room to be you. <span>✳</span></p></> : view === 'Study' ? <StudyWorkspace state={state} save={save} busy={busy}/> : view === 'Planner' ? <PlannerWorkspace state={state} save={save} busy={busy}/> : view === 'Grades' ? <GradeWorkspace state={state} save={save} busy={busy}/> : view === 'Textbooks' ? <TextbookWorkspace state={state} save={save} busy={busy}/> : view === 'Calendar sync' ? <CalendarSync state={state} onExport={() => { QuickText(''); goto('Deadlines'); }}/> : view === 'Deadlines' ? <DeadlineWorkspace state={state} save={save} busy={busy} initialQuick={quickText}/> : view === 'My schedule' ? <><div className="page-heading"><div><p className="eyebrow">{profile.semester.toUpperCase()}</p><h1>Your weekly rhythm.</h1><p className="muted">Every lecture, lab, and discussion, in one place.</p></div><button className="primary" onClick={() => Editor(emptyCourse())}><Plus size={18}/>Add a class</button></div><section className="panel"><div className="section-head"><div><h2>{new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00Z'))}</h2><p>{profile.timezone.replaceAll('_', ' ')}</p></div><div className="row"><button className="icon" aria-label="Previous week" onClick={() => Offset(offset - 7)}><ChevronLeft /></button><button className="secondary compact" onClick={() => Offset(0)}>Today</button><button className="icon" aria-label="Next week" onClick={() => Offset(offset + 7)}><ChevronRight /></button></div></div><div className="week-tabs">{Array.from({ length: 7 }, (_, i) => { const d = addDays(date, -((dow + 6) % 7) + i); return <button key={d} className={d === date ? 'selected' : ''} onClick={() => Offset(offset + i - ((dow + 6) % 7))}><span>{days[dayOf(d)]}</span><strong>{Number(d.slice(-2))}</strong><span className={`day-mark ${courses.some(c => c.days.includes(dayOf(d))) && d >= profile.start && d <= profile.end ? 'has' : ''}`}/></button>; })}</div>{daily.length ? <div className="course-grid">{daily.map(c => <CourseCard key={c.id} c={c} onEdit={() => Editor(c)} onDelete={() => Delete(c.id)}/>)}</div> : <div className="empty"><CalendarDays size={28}/><h3>{inTerm ? 'Nothing scheduled for this day' : 'Outside your semester'}</h3><p>{inTerm ? 'Choose another day or add a class to your week.' : 'Update your semester dates in Settings if your classes have started.'}</p></div>}</section><div className="section-head all-classes"><h2>All class meetings <span className="count">{courses.length}</span></h2><small>Repeats weekly during your semester</small></div>{courses.some(c => conflicts(c, courses).length > 0) && <p className="warning"><AlertCircle size={16}/>Some classes overlap. Open their details to adjust meeting times.</p>}<div className="course-grid">{courses.map(c => <CourseCard key={c.id} c={c} onEdit={() => Editor(c)} onDelete={() => Delete(c.id)}/>)}</div>{!courses.length && <button className="add-class" onClick={() => Editor(emptyCourse())}><Plus size={18}/>Add your first class</button>}</> : view === 'My campus' ? <><div className="page-heading"><div><p className="eyebrow">A PLACE TO CALL YOURS</p><h1>My campus.</h1><p className="muted">The details that make CampusOS personal.</p></div><button className="secondary" onClick={() => goto('Settings')}><Pencil size={17}/>Edit profile</button></div><section className="hero campus-hero"><div><GraduationCap size={38}/><h2>{profile.university}</h2><p>{profile.domain}</p></div></section><div className="profile-cards"><section className="panel"><h2>Your academic path</h2><dl><dt>Major(s)</dt><dd>{profile.majors}</dd><dt>Minor(s)</dt><dd>{profile.minors || 'None added'}</dd><dt>Expected graduation</dt><dd>{profile.graduation}</dd></dl></section><section className="panel"><h2>{profile.semester}</h2><dl><dt>Semester dates</dt><dd>{profile.start} — {profile.end}</dd><dt>Campus timezone</dt><dd>{profile.timezone}</dd><dt>School website</dt><dd><a href={`https://${profile.domain}`} target="_blank" rel="noreferrer">{profile.domain}<ArrowUpRight size={14}/></a></dd></dl></section></div><p className="helper">Semester dates are your entries. Automatic university calendar imports will arrive in a later phase.</p></> : <><div className="page-heading"><div><p className="eyebrow">MAKE IT YOURS</p><h1>Your settings.</h1><p className="muted">Keep your campus and semester details up to date.</p></div></div><section className="panel"><h2>Take your data with you</h2><p className="helper">Download your saved profile, courses, deadlines, books, grades, planner and study tools as JSON. Google tokens and server secrets are excluded.</p><a className="secondary" href="/api/export" target="_blank" rel="noreferrer">Download my data</a></section><section className="panel settings-panel"><form onSubmit={async (e) => {
                    e.preventDefault();
                    const parsed = profileSchema.safeParse(profile);
                    if (!parsed.success) {
                        E(parsed.error.issues[0].message);
                        return;
                    }
                    await save({ ...state, profile: parsed.data });
                }}><h2>University & profile</h2><ProfileForm p={profile} set={P} step={0}/><h2>Studies & semester</h2><ProfileForm p={profile} set={P} step={1}/><div className="modal-actions"><button disabled={busy} className="primary">{busy ? 'Saving…' : 'Save changes'}<Check size={17}/></button></div></form></section><p className="helper">This private edition uses ChatGPT sign-in. Email and Google sign-in are not configured.</p></>}</div></main><nav className="mobile-nav">{[{ n: 'Today', i: LayoutDashboard }, { n: 'My schedule', i: CalendarDays }, { n: 'Deadlines', i: BookOpen }, { n: 'Study', i: Sparkles }, { n: 'Planner', i: CalendarDays }, { n: 'Grades', i: Layers }, { n: 'Textbooks', i: BookOpen }, { n: 'Calendar sync', i: Clock }, { n: 'My campus', i: GraduationCap }, { n: 'Settings', i: Settings }].map(({ n, i: Icon }) => <button key={n} className={view === n ? 'active' : ''} onClick={() => goto(n)}><Icon size={21}/><span>{n.replace('My ', '').replace('Calendar sync', 'Sync')}</span></button>)}</nav></div>}{editor && <CourseEditor key={editor.id} course={editor} all={courses} onSave={saveCourse} onClose={() => Editor(null)} busy={busy}/>} {deleteId && <div className="overlay"><section className="modal small-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Remove this class?</h2><p>It will be removed from your saved schedule.</p><div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => Delete(null)}>Keep class</button><button className="danger" disabled={busy} onClick={remove}>{busy ? 'Removing…' : 'Remove class'}</button></div></section></div>}{toast && <div className="toast" role="status"><CheckCircle2 size={18}/>{toast}</div>}{error && (editor || deleteId) && <div className="toast error" role="alert">{error}</div>}</>;
}
