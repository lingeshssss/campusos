import type { State } from './model.ts';
import { addDays } from './model.ts';
import { localToUtc } from './calendar.ts';
import { remainingSeconds } from './study.ts';

// Plans on-device notifications (iOS app). Mirrors the .ics alarms: exams and papers remind 7 days and
// 1 day before; other deadlines 1 day before. Untimed deadlines remind at 9:00 campus time.

export type PlannedReminder = { id: number; at: Date; title: string; body: string; kind: 'deadline' | 'timer' };

/** iOS keeps at most 64 pending local notifications per app; leave room for the focus timer. */
export const MAX_DEADLINE_REMINDERS = 60;
export const TIMER_REMINDER_ID = 1;
const UNTIMED_REMINDER_TIME = '09:00';

/** Stable positive 31-bit ID per reminder so rescheduling replaces rather than duplicates. */
export function reminderId(key: string) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    return 1000 + ((h >>> 0) % 2_000_000_000);
}

export function planDeadlineReminders(state: State, now: Date, limit = MAX_DEADLINE_REMINDERS): PlannedReminder[] {
    const zone = state.profile?.timezone;
    if (!zone) return [];
    const out: PlannedReminder[] = [];
    for (const d of state.deadlines) {
        if (d.done || !d.date) continue;
        for (const days of d.kind === 'exam' || d.kind === 'paper' ? [7, 1] : [1]) {
            let at: Date;
            try {
                at = localToUtc(addDays(d.date, -days), d.time || UNTIMED_REMINDER_TIME, zone);
            } catch {
                continue; // nonexistent local time (daylight-saving gap)
            }
            if (at.getTime() <= now.getTime()) continue;
            const when = days === 1 ? 'tomorrow' : 'in one week';
            out.push({ id: reminderId(`deadline:${d.id}:${days}`), at, kind: 'deadline', title: `${d.courseCode ? d.courseCode + ': ' : ''}${d.title}`.slice(0, 120), body: `Due ${when}${d.time ? ' at ' + d.time : ''}.` });
        }
    }
    return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, limit);
}

/** A running focus/break timer gets one notification at its end. Paused or finished timers get none. */
export function planTimerReminder(state: State, now: Date): PlannedReminder | null {
    const t = state.study.timer;
    if (!t?.startedAt) return null;
    const left = remainingSeconds(t, now.getTime());
    if (left <= 0) return null;
    return { id: TIMER_REMINDER_ID, at: new Date(now.getTime() + left * 1000), kind: 'timer', title: t.kind === 'focus' ? `Focus session complete: ${t.courseCode}` : 'Break’s over', body: t.kind === 'focus' ? 'Open CampusOS to log your study time.' : 'Ready for the next focus session?' };
}

export function planReminders(state: State, now: Date, options: { deadlines: boolean; timer: boolean }): PlannedReminder[] {
    const timer = options.timer ? planTimerReminder(state, now) : null;
    return [...(timer ? [timer] : []), ...(options.deadlines ? planDeadlineReminders(state, now) : [])];
}
