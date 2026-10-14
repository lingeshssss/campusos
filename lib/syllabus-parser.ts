import { z } from 'zod';
import { deadlineKinds, dateValue } from './deadlines.ts';
export const candidateSchema = z.object({ title: z.string().min(1).max(200), date: z.union([dateValue, z.literal('')]), time: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]), kind: z.enum(deadlineKinds), weight: z.number().min(0).max(100).nullable(), source: z.string().max(500), note: z.string().max(1000) });
export const extractionSchema = z.object({ items: z.array(candidateSchema).max(300), grading: z.array(z.object({ category: z.string().min(1).max(100), weight: z.number().min(0).max(100) })).max(30), warnings: z.array(z.string().max(500)).max(100) });
export type Extraction = z.infer<typeof extractionSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthPattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const datePattern = new RegExp(`\\b(?:\\d{4}-\\d{2}-\\d{2}|${monthPattern}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}\\s+${monthPattern}\\.?(?:,?\\s+\\d{4})?|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)\\b`, 'gi');
function add(date: string, n: number) { const d = new Date(date + 'T12:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function inferDate(raw: string, start: string, end: string) { if (/^\d{4}-/.test(raw))
    return raw; const nums = raw.match(/\d+/g) ?? []; let month = 0, day = 0, year: number | undefined; if (raw.includes('/')) {
    month = Number(nums[0] ?? '0');
    day = Number(nums[1] ?? '0');
    if (nums[2])
        year = Number(nums[2] ?? '0') + (nums[2].length === 2 ? 2000 : 0);
}
else {
    month = months.findIndex(m => raw.toLowerCase().includes(m)) + 1;
    day = Number(nums[0] ?? '0');
    if (nums[1])
        year = Number(nums[1] ?? '0');
} const build = (y: number) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; if (year)
    return build(year); const a = +start.slice(0, 4), b = +end.slice(0, 4); for (let y = a; y <= b; y++) {
    const date = build(y);
    if (date >= start && date <= end)
        return date;
} return build(a); }
export function detectKind(line: string): Candidate['kind'] { if (/\b(exam|midterm|final)\b/i.test(line))
    return 'exam'; if (/\b(essay|paper|report|project)\b/i.test(line))
    return 'paper'; if (/\bquiz(?:zes)?\b/i.test(line))
    return 'quiz'; if (/\b(homework|problem set|assignment|pset|hw)\b/i.test(line))
    return 'homework'; if (/\b(drop|withdraw|registration|break|holiday|recess)\b/i.test(line))
    return 'academic'; return 'other'; }
export function extractTime(line: string) { const mer = line.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i); if (mer) {
    const h = +mer[1], m = +(mer[2] ?? 0);
    if (h < 1 || h > 12 || m > 59)
        return '';
    return `${String(h % 12 + (/^p/i.test(mer[3]) ? 12 : 0)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
} const t = line.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/); return t ? `${t[1]}:${t[2]}` : ''; }
export function parseSyllabus(text: string, start: string, end: string, today: string, quick = false): Extraction {
    const result: Extraction = { items: [], grading: [], warnings: [] };
    const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const matches = [...line.matchAll(new RegExp(datePattern))];
        const weightMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
        const weight = weightMatch ? Number(weightMatch[1]) : null;
        let relative = '';
        if (quick && !matches.length) {
            if (/\btomorrow\b/i.test(line))
                relative = add(today, 1);
            else if (/\b(today|tonight)\b/i.test(line))
                relative = today;
            else {
                const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const day = names.findIndex(d => new RegExp(`\\b${d}\\b`, 'i').test(line));
                if (day >= 0) {
                    const n = (day - new Date(today + 'T12:00Z').getUTCDay() + 7) % 7;
                    relative = add(today, n + (n === 0 && /\bnext\b/i.test(line) ? 7 : 0));
                }
            }
        }
        if (weight !== null && !matches.length && !relative && weight <= 100) {
            result.grading.push({ category: line.replace(/[:\-–]?\s*\d+(?:\.\d+)?\s*%.*/, '').trim().slice(0, 100) || 'Unlabeled category', weight });
        }
        if (!matches.length && !relative) {
            if (/\b(TBA|TBD|every|weekly|week\s+\d|due|exam|midterm|paper|quiz)\b/i.test(line) && weight === null) {
                result.items.push({ title: line.slice(0, 200), date: '', time: extractTime(line), kind: detectKind(line), weight: null, source: line.slice(0, 500), note: 'No explicit calendar date found. Enter a date or discard this row.' });
            }
            continue;
        }
        const dates = relative ? [relative] : matches.map(m => inferDate(m[0], start, end));
        let title = line.replace(new RegExp(datePattern), '').replace(/^[\s|:;–—-]+|[\s|:;–—-]+$/g, '').trim();
        if (title.length < 3)
            title = (lines[i + 1] ?? 'Dated syllabus item').slice(0, 200);
        for (const date of dates) {
            const valid = dateValue.safeParse(date).success;
            const note = [!valid ? 'Invalid date; correct it before saving.' : '', valid && (date < start || date > end) ? 'Outside your semester; confirm the date and year.' : '', !relative && !matches.every(m => /\d{4}/.test(m[0])) ? 'Year inferred from semester; confirm.' : '', matches.some(m => m[0].includes('/')) ? 'Numeric dates interpreted as MM/DD.' : '', dates.length > 1 ? 'Multiple dates on this line; confirm whether these are separate events or a date range.' : ''].filter(Boolean).join(' ');
            result.items.push({ title: title.slice(0, 200) || 'Dated syllabus item', date: valid ? date : '', time: extractTime(line), kind: detectKind(line), weight: weight !== null && weight <= 100 ? weight : null, source: line.slice(0, 500), note });
        }
    }
    if (result.items.length > 300) {
        result.warnings.push('Only the first 300 candidate entries are shown. Import remaining content separately.');
        result.items = result.items.slice(0, 300);
    }
    result.grading = result.grading.slice(0, 30);
    result.warnings.push('Basic extraction: verify every date, year, title, time, and percentage. It may miss tables, recurring assignments, or dates spread across lines.');
    return result;
}
