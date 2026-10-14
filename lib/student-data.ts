import { stateSchema, type State } from './model.ts';
import { remainingSeconds } from './study.ts';

// Shared by /api/export and /api/import. Exports contain only validated student state:
// never user IDs, Google tokens, OAuth state or sync plans.
export const EXPORT_FORMAT = 'campusos-student-data';
export const EXPORT_SCHEMA_VERSION = 7;
export const SUPPORTED_IMPORT_VERSIONS = [7];
export const MAX_IMPORT_BYTES = 3_000_000;

export function exportDocument(state: State, now = new Date()) {
    return { format: EXPORT_FORMAT, schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt: now.toISOString(), state };
}

export type StateSummary = {
    name: string | null;
    university: string | null;
    semester: string | null;
    courses: number;
    deadlines: number;
    books: number;
    gradeCourses: number;
    plannerCourses: number;
    studyBlocks: number;
    flashcards: number;
    studySessions: number;
};

export function summarize(state: State): StateSummary {
    return {
        name: state.profile?.name ?? null,
        university: state.profile?.university ?? null,
        semester: state.profile?.semester ?? null,
        courses: state.courses.length,
        deadlines: state.deadlines.length,
        books: state.books.length,
        gradeCourses: state.gradeCourses.length,
        plannerCourses: state.planner.courses.length,
        studyBlocks: state.study.blocks.length,
        flashcards: state.study.cards.length,
        studySessions: state.study.sessions.length,
    };
}

export type PreparedImport =
    | { ok: true; state: State; summary: StateSummary; exportedAt: string | null; warnings: string[] }
    | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validates an exported CampusOS document and returns the state to store for the *current* user.
 * Unknown keys (including any user IDs or tokens someone added by hand) are stripped by the schema.
 */
export function prepareImport(document: unknown, now = Date.now()): PreparedImport {
    if (!isObject(document) || document.format !== EXPORT_FORMAT)
        return { ok: false, error: 'This is not a CampusOS data export. Choose the campusos-data.json file downloaded from Settings → Download my data.' };
    const version = document.schemaVersion;
    if (typeof version !== 'number' || !Number.isInteger(version))
        return { ok: false, error: 'This export is missing its schema version, so it cannot be imported safely.' };
    if (version > EXPORT_SCHEMA_VERSION)
        return { ok: false, error: `This export uses schema version ${version}, which is newer than this app supports (${EXPORT_SCHEMA_VERSION}). Update CampusOS before importing.` };
    if (!SUPPORTED_IMPORT_VERSIONS.includes(version))
        return { ok: false, error: `Schema version ${version} exports are not supported. Export your data again from an up-to-date CampusOS.` };
    if (!isObject(document.state))
        return { ok: false, error: 'This export does not contain any student data.' };
    const parsed = stateSchema.safeParse(document.state);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue.path.length ? ` (at ${issue.path.join(' → ')})` : '';
        return { ok: false, error: `The file failed validation${where}: ${issue.message}. Nothing was imported.` };
    }
    const state = parsed.data, warnings: string[] = [];
    const exportedAtMs = typeof document.exportedAt === 'string' ? Date.parse(document.exportedAt) : NaN;
    const exportedAt = Number.isFinite(exportedAtMs) ? new Date(exportedAtMs).toISOString() : null;
    const timer = state.study.timer;
    if (timer?.startedAt) {
        // A timer that was running at export time must not keep counting until the import, which could
        // silently log hours of study. Freeze it at the moment of export (or at its start if unknown).
        const at = exportedAt && exportedAtMs <= now ? exportedAtMs : Date.parse(timer.startedAt);
        state.study = { ...state.study, timer: { ...timer, remaining: remainingSeconds(timer, at), startedAt: null } };
        warnings.push(`A ${timer.kind} timer for ${timer.courseCode} was running when this file was exported. It will be imported paused, with time counted only up to the export. Resume or discard it in Study.`);
    }
    if (!state.profile)
        warnings.push('This export has no profile, so you will see onboarding after importing.');
    if (exportedAt && exportedAtMs > now + 5 * 60_000)
        warnings.push('The export date is in the future. Check that this is the file you expect.');
    return { ok: true, state, summary: summarize(state), exportedAt, warnings };
}
