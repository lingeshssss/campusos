import type { State } from './model.ts';
import { addDays, dayOf } from './model.ts';
import { localToUtc } from './calendar.ts';
export type GoogleEvent = {
    id?: string;
    etag?: string;
    status?: string;
    summary: string;
    description: string;
    location?: string;
    start: {
        dateTime?: string;
        date?: string;
        timeZone?: string;
    };
    end: {
        dateTime?: string;
        date?: string;
        timeZone?: string;
    };
    recurrence?: string[];
    reminders: {
        useDefault: boolean;
        overrides?: {
            method: 'popup';
            minutes: number;
        }[];
    };
    transparency: 'opaque' | 'transparent';
    visibility: 'private';
    extendedProperties: {
        private: Record<string, string>;
    };
};
export type DesiredEvent = {
    key: string;
    kind: 'class' | 'deadline';
    title: string;
    body: GoogleEvent;
};
export function desiredEvents(state: State, owner: string, classes = true, deadlines = true): DesiredEvent[] { const p = state.profile; if (!p)
    throw Error('Finish onboarding first.'); if (Date.parse(p.end) - Date.parse(p.start) > 550 * 86400000)
    throw Error('Set a semester of 550 days or fewer.'); const events: DesiredEvent[] = []; const tags = (key: string) => ({ private: { campusosOwner: owner, campusosKey: key } }); if (classes) {
    for (const c of state.courses) {
        let first = p.start;
        for (let i = 0; i < 7 && !c.days.includes(dayOf(first)); i++)
            first = addDays(first, 1);
        if (first > p.end)
            continue;
        const until = localToUtc(p.end, '23:59', p.timezone).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
        const key = 'class:' + c.id;
        const weekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        events.push({ key, kind: 'class', title: `${c.code} · ${c.title}`, body: { summary: `${c.code} · ${c.title}`, description: `Managed by CampusOS. Change class details in CampusOS, then sync.\nSection: ${c.section || '—'}\nProfessor: ${c.professor || '—'}\nHolidays are not automatically excluded.`, location: [c.building, c.room].filter(Boolean).join(' · '), start: { dateTime: localToUtc(first, c.start, p.timezone).toISOString(), timeZone: p.timezone }, end: { dateTime: localToUtc(first, c.end, p.timezone).toISOString(), timeZone: p.timezone }, recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${[...new Set(c.days)].sort().map(d => weekdays[d]).join(',')};UNTIL=${until}`], reminders: { useDefault: false, overrides: [] }, transparency: 'opaque', visibility: 'private', extendedProperties: tags(key) } });
    }
} if (deadlines) {
    for (const d of state.deadlines.filter(d => !d.done)) {
        const key = 'deadline:' + d.id;
        const start = d.time ? localToUtc(d.date, d.time, p.timezone) : null;
        events.push({ key, kind: 'deadline', title: `${d.courseCode ? d.courseCode + ' · ' : ''}${d.title}`, body: { summary: `${d.courseCode ? d.courseCode + ' · ' : ''}${d.title}`, description: [`Managed by CampusOS. ${d.kind}.`, d.weight !== null ? `${d.weight}% of course grade.` : '', d.notes, d.source ? `Source: ${d.source}` : ''].filter(Boolean).join('\n'), start: start ? { dateTime: start.toISOString(), timeZone: p.timezone } : { date: d.date }, end: start ? { dateTime: new Date(start.getTime() + 15 * 60000).toISOString(), timeZone: p.timezone } : { date: addDays(d.date, 1) }, reminders: { useDefault: false, overrides: (['exam', 'paper'].includes(d.kind) ? [10080, 1440] : [1440]).map(minutes => ({ method: 'popup' as const, minutes })) }, transparency: 'transparent', visibility: 'private', extendedProperties: tags(key) } });
    }
} return events; }
export function comparableEvent(event: GoogleEvent) { const boundary = (x: GoogleEvent['start']) => x.date ? { date: x.date } : { instant: new Date(x.dateTime!).toISOString(), timeZone: event.recurrence?.length ? (x.timeZone ?? '') : '' }; return JSON.stringify({ summary: event.summary, description: event.description ?? '', location: event.location ?? '', start: boundary(event.start), end: boundary(event.end), recurrence: [...(event.recurrence ?? [])].sort(), reminders: { useDefault: !!event.reminders?.useDefault, overrides: [...(event.reminders?.overrides ?? [])].map(r => ({ method: r.method, minutes: r.minutes })).sort((a, b) => b.minutes - a.minutes) }, transparency: event.transparency ?? 'opaque', visibility: event.visibility ?? 'default' }); }
export function isOwnedEvent(event: Partial<GoogleEvent>, owner: string, key: string) { return event.extendedProperties?.private?.campusosOwner === owner && event.extendedProperties?.private?.campusosKey === key; }
export type SyncAction = {
    op: 'create' | 'update' | 'remove';
    key: string;
    eventId: string;
    title: string;
    etag?: string;
    body?: GoogleEvent;
};
export type EventRecord = {
    id: string;
    title: string;
    kind: 'class' | 'deadline';
    tombstone?: boolean;
    confirmed?: boolean;
};
export type EventMap = Record<string, EventRecord>;
export type SyncPlan = {
    stateVersion: number;
    calendarId: string;
    googleSub: string;
    actions: SyncAction[];
    unchanged: number;
    classes: boolean;
    deadlines: boolean;
};
