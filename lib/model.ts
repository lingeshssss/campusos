import { z } from 'zod';
import { gradeCourseSchema, gpaSettingsSchema, defaultGpa } from './grades.ts';
import { plannerSchema, defaultPlanner } from './planner.ts';
import { studySchema, defaultStudy } from './study.ts';
import { bookSchema } from './textbooks.ts';
import { deadlineSchema, gradingSchema } from './deadlines.ts';
import { preferencesField } from './theme/preferences.ts';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Invalid date');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const courseSchema = z.object({ id: z.string().uuid(), code: z.string().trim().min(1).max(50), title: z.string().trim().min(1).max(150), section: z.string().max(30), days: z.array(z.number().int().min(0).max(6)).min(1).max(7), start: time, end: time, building: z.string().max(150), room: z.string().max(50), professor: z.string().max(150), travel: z.number().int().min(0).max(180), color: z.enum(['mint', 'blue', 'peach', 'purple']) }).refine(c => c.end > c.start, 'End time must follow start time');
export const profileSchema = z.object({ name: z.string().trim().min(1).max(80), university: z.string().trim().min(1).max(200), domain: z.string().trim().regex(/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/), majors: z.string().trim().min(1).max(200), minors: z.string().max(200), graduation: z.number().int().min(2020).max(2100), semester: z.string().trim().min(1).max(60), start: date, end: date, timezone: z.string().refine(v => {
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: v });
            return true;
        }
        catch {
            return false;
        }
    }, 'Invalid timezone') }).refine(p => p.end >= p.start, 'Semester must end after it starts');
export const stateSchema = z.object({ study: studySchema.default(defaultStudy), planner: plannerSchema.default(defaultPlanner), gradeCourses: z.array(gradeCourseSchema).max(100).default([]), gpaSettings: gpaSettingsSchema.default(defaultGpa), books: z.array(bookSchema).max(300).default([]), profile: profileSchema.nullable(), courses: z.array(courseSchema).max(100), deadlines: z.array(deadlineSchema).max(1000).default([]), grading: z.array(gradingSchema).max(200).default([]), preferences: preferencesField }).refine(s => new Set(s.courses.map(c => c.id)).size === s.courses.length, 'Duplicate course IDs').refine(s => new Set(s.deadlines.map(d => d.id)).size === s.deadlines.length, 'Duplicate deadline IDs').refine(s => new Set(s.books.map(b => b.id)).size === s.books.length, 'Duplicate book IDs').refine(s => new Set(s.gradeCourses.map(c => c.courseCode.toLowerCase())).size === s.gradeCourses.length, 'Each course can have only one grade record').refine(s => new Set(s.gradeCourses.map(c => c.id)).size === s.gradeCourses.length, 'Duplicate grade record IDs');
export type Course = z.infer<typeof courseSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type State = z.infer<typeof stateSchema>;
export function minutes(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
export function clock(t: string) { const m = minutes(t), h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; }
export function leaveTime(c: Course) { const m = (minutes(c.start) - c.travel + 1440) % 1440; return clock(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`) + (minutes(c.start) < c.travel ? ' (previous day)' : ''); }
export function conflicts(c: Course, all: Course[]) { return all.filter(x => x.id !== c.id && x.days.some(d => c.days.includes(d)) && c.start < x.end && x.start < c.end); }
export function localDate(now: Date, tz: string) { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now); const v = (k: string) => p.find(x => x.type === k)!.value; return `${v('year')}-${v('month')}-${v('day')}`; }
export function dayOf(date: string) { return new Date(date + 'T12:00:00Z').getUTCDay(); }
export function addDays(date: string, n: number) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
