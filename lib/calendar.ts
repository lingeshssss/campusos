import type { State } from './model.ts';
import { addDays, dayOf } from './model.ts';
export function calendarEscape(value: string) { return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r/g, ''); }
export function foldLine(value: string) { const encoder = new TextEncoder(); let lines: string[] = [], line = '', bytes = 0; for (const ch of value) {
    const n = encoder.encode(ch).length;
    if (bytes + n > 75) {
        lines.push(line);
        line = ' ';
        bytes = 1;
    }
    line += ch;
    bytes += n;
} lines.push(line); return lines.join('\r\n'); }
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localToUtc(date: string, time: string, zone: string) { let fmt = formatters.get(zone); if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    formatters.set(zone, fmt);
} const target = Date.parse(`${date}T${time}:00Z`); const wall = (ts: number) => { const p = fmt!.formatToParts(new Date(ts)); const v = (k: string) => p.find(x => x.type === k)!.value; return Date.parse(`${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}:${v('second')}Z`); }; let guess = target; for (let i = 0; i < 5; i++) {
    const delta = target - wall(guess);
    if (delta === 0) {
        if (wall(guess - 3600000) === target)
            guess -= 3600000;
        return new Date(guess);
    }
    guess += delta;
} throw Error(`The time ${date} ${time} does not exist in ${zone} due to daylight saving. Edit this event before export.`); }
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
export function makeCalendar(state: State, includeClasses: boolean, now = new Date()) {
    if (!state.profile)
        throw Error('Finish onboarding first.');
    const p = state.profile;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CampusOS//Semester Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:CampusOS — ' + calendarEscape(p.semester), 'X-WR-TIMEZONE:' + calendarEscape(p.timezone)];
    let count = 0;
    const event = (uid: string, title: string, start: string, end: string, description: string, location: string, alarms: number[], updated: string) => { count++; lines.push('BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp(now), 'LAST-MODIFIED:' + stamp(new Date(updated)), 'SUMMARY:' + calendarEscape(title), start, end, 'DESCRIPTION:' + calendarEscape(description)); if (location)
        lines.push('LOCATION:' + calendarEscape(location)); for (const days of alarms)
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-P${days}D`, 'DESCRIPTION:' + calendarEscape(title), 'END:VALARM'); lines.push('END:VEVENT'); };
    for (const d of state.deadlines.filter(x => !x.done)) {
        let start: string, end: string;
        if (d.time) {
            const instant = localToUtc(d.date, d.time, p.timezone);
            start = 'DTSTART:' + stamp(instant);
            end = 'DTEND:' + stamp(new Date(instant.getTime() + 15 * 60000));
        }
        else {
            start = 'DTSTART;VALUE=DATE:' + d.date.replaceAll('-', '');
            end = 'DTEND;VALUE=DATE:' + addDays(d.date, 1).replaceAll('-', '');
        }
        event(`${d.id}@campusos`, `${d.courseCode ? d.courseCode + ' · ' : ''}${d.title}`, start, end, [d.kind, d.weight !== null ? `${d.weight}% of course grade` : '', d.notes, d.source ? `Source: ${d.source}` : ''].filter(Boolean).join('\n'), '', d.kind === 'exam' || d.kind === 'paper' ? [7, 1] : [1], d.updatedAt);
    }
    if (includeClasses) {
        if (Date.parse(p.end) - Date.parse(p.start) > 550 * 86400000)
            throw Error('Class export supports semesters up to 550 days. Update semester dates or export deadlines only.');
        for (let date = p.start; date <= p.end; date = addDays(date, 1)) {
            for (const c of state.courses.filter(x => x.days.includes(dayOf(date)))) {
                event(`${c.id}-${date}@campusos`, `${c.code} · ${c.title}`, 'DTSTART:' + stamp(localToUtc(date, c.start, p.timezone)), 'DTEND:' + stamp(localToUtc(date, c.end, p.timezone)), `Section ${c.section || 'not provided'}\nProfessor: ${c.professor || 'not provided'}\nCampus timezone: ${p.timezone}`, [c.building, c.room].filter(Boolean).join(' · '), [], now.toISOString());
            }
        }
    }
    lines.push('END:VCALENDAR');
    return { content: lines.map(foldLine).join('\r\n') + '\r\n', count };
}
