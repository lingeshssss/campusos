import { z } from 'zod';
export const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Enter a valid date');
export const deadlineKinds = ['exam', 'paper', 'homework', 'quiz', 'academic', 'other'] as const;
export const deadlineSchema = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200), courseCode: z.string().max(50), kind: z.enum(deadlineKinds), date: dateValue, time: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]), weight: z.number().min(0).max(100).nullable(), done: z.boolean(), notes: z.string().max(2000), source: z.string().max(500), updatedAt: z.string().datetime() });
export const gradingSchema = z.object({ id: z.string().uuid(), courseCode: z.string().max(50), category: z.string().trim().min(1).max(100), weight: z.number().min(0).max(100) });
export type Deadline = z.infer<typeof deadlineSchema>;
export type Grading = z.infer<typeof gradingSchema>;
export function daysUntil(date: string, today: string) { return Math.round((Date.parse(date + 'T12:00Z') - Date.parse(today + 'T12:00Z')) / 86400000); }
export function priority(d: Deadline, today: string) { const n = daysUntil(d.date, today); return (n < 0 ? 1000 : 100 / (n + 1)) + (d.weight ?? 0) / 2 + (['exam', 'paper'].includes(d.kind) ? 12 : 0); }
export function upcoming(items: Deadline[], today: string, limit = 7) { return items.filter(d => !d.done && daysUntil(d.date, today) <= limit).sort((a, b) => priority(b, today) - priority(a, today) || a.date.localeCompare(b.date)); }
export function duplicateKey(d: Pick<Deadline, 'title' | 'date' | 'courseCode' | 'time'>) { return [d.courseCode.toLowerCase().trim(), d.title.toLowerCase().replace(/\s+/g, ' ').trim(), d.date, d.time].join('|'); }
export function mergeDeadlines(existing: Deadline[], incoming: Deadline[]) { const keys = new Set(existing.map(duplicateKey)); const added = incoming.filter(d => { const key = duplicateKey(d); if (keys.has(key))
    return false; keys.add(key); return true; }); return { deadlines: [...existing, ...added], added: added.length, skipped: incoming.length - added.length }; }
