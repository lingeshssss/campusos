import { stateSchema } from '../../model.ts';
import { exportDocument, prepareImport, summarize, MAX_IMPORT_BYTES } from '../../student-data.ts';
import { json, unauthorized, sameOrigin, readText, BodyTooLargeError } from '../http.ts';
import { loadState, writeState } from '../state-store.ts';
import { describeDbError } from '../db-error.ts';
import type { ApiDeps } from '../types.ts';

const CONFLICT = 'Your data changed in another tab or device. Reload before editing.';

export function stateRoutes(deps: ApiDeps) {
    async function GET() {
        const user = await deps.user();
        if (!user) return unauthorized();
        try {
            const { state, version } = await loadState(deps.db(), user.id);
            return json({ state, version });
        } catch (e) {
            console.error('state load failed', e);
            return json({ error: `Unable to load your data. ${describeDbError(e)}` }, 503);
        }
    }

    async function PUT(request: Request) {
        const user = await deps.user();
        if (!user) return unauthorized('Your session has ended. Sign in again to save; your unsaved changes are still on this screen.');
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin' }, 403);
        let body: { state?: Record<string, unknown>; version?: unknown };
        try {
            body = JSON.parse(await readText(request, MAX_IMPORT_BYTES));
        } catch (e) {
            return e instanceof BodyTooLargeError ? json({ error: 'Request too large' }, 413) : json({ error: 'Invalid request' }, 400);
        }
        try {
            const db = deps.db(), { stored: previous } = await loadState(db, user.id);
            const incoming = body.state ?? {};
            // Older open tabs must not erase fields added by later phases.
            const parsed = stateSchema.safeParse({ ...incoming, study: incoming.study ?? previous.study, planner: incoming.planner ?? previous.planner, gradeCourses: incoming.gradeCourses ?? previous.gradeCourses ?? [], gpaSettings: incoming.gpaSettings ?? previous.gpaSettings, books: incoming.books ?? previous.books ?? [], deadlines: incoming.deadlines ?? previous.deadlines ?? [], grading: incoming.grading ?? previous.grading ?? [] });
            if (!parsed.success || typeof body.version !== 'number' || !Number.isInteger(body.version) || body.version < 0)
                return json({ error: parsed.success ? 'Invalid version' : parsed.error.issues[0].message }, 400);
            const version = await writeState(db, user.id, body.version, parsed.data);
            if (version === null) return json({ error: CONFLICT, code: 'conflict' }, 409);
            return json({ version });
        } catch (e) {
            console.error('state save failed', e);
            // The session is for an account that no longer exists in auth.users (e.g. deleted); sign in again.
            if ((e as { cause?: { code?: string } })?.cause?.code === '23503') return unauthorized('Your account could not be found. Sign in again to continue.');
            return json({ error: `Could not save. Your changes are still here. ${describeDbError(e)}` }, 503);
        }
    }

    return { GET, PUT };
}

export function exportRoutes(deps: ApiDeps) {
    async function GET() {
        const user = await deps.user();
        if (!user) return unauthorized();
        try {
            const { state } = await loadState(deps.db(), user.id);
            return new Response(JSON.stringify(exportDocument(state), null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="campusos-data.json"', 'Cache-Control': 'no-store' } });
        } catch (e) {
            console.error('export failed', e);
            return json({ error: 'Could not export data. Please retry.' }, 503);
        }
    }
    return { GET };
}

/**
 * POST { document, mode: 'preview' } validates and summarizes without writing.
 * POST { document, mode: 'replace', confirm: true, expectedVersion } replaces the signed-in user's state,
 * only if nothing was saved since the preview.
 */
export function importRoutes(deps: ApiDeps) {
    async function POST(request: Request) {
        const user = await deps.user();
        if (!user) return unauthorized('Your session has ended. Sign in again, then retry the import.');
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
        let body: { document?: unknown; mode?: unknown; confirm?: unknown; expectedVersion?: unknown };
        try {
            body = JSON.parse(await readText(request, MAX_IMPORT_BYTES + 1000));
        } catch (e) {
            return e instanceof BodyTooLargeError
                ? json({ error: 'This file is larger than 3 MB, which is bigger than any valid CampusOS export.' }, 413)
                : json({ error: 'The file is not valid JSON.' }, 400);
        }
        if (body.mode !== 'preview' && body.mode !== 'replace') return json({ error: 'Choose preview or replace.' }, 400);
        const prepared = prepareImport(body.document, (deps.now ?? Date.now)());
        if (!prepared.ok) return json({ error: prepared.error }, 422);
        try {
            const db = deps.db(), current = await loadState(db, user.id);
            if (body.mode === 'preview')
                return json({ summary: prepared.summary, warnings: prepared.warnings, exportedAt: prepared.exportedAt, current: { version: current.version, summary: summarize(current.state) } });
            if (body.confirm !== true) return json({ error: 'Confirm that you want to replace your current data.' }, 400);
            const expected = body.expectedVersion;
            if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 0) return json({ error: 'Preview the file again before importing.' }, 400);
            if (expected !== current.version)
                return json({ error: 'Your CampusOS data changed after this preview. Preview the file again before replacing anything.', code: 'conflict' }, 409);
            const version = await writeState(db, user.id, expected, prepared.state);
            if (version === null)
                return json({ error: 'Your CampusOS data changed after this preview. Preview the file again before replacing anything.', code: 'conflict' }, 409);
            return json({ imported: true, version, summary: prepared.summary, warnings: prepared.warnings });
        } catch (e) {
            console.error('import failed', e);
            return json({ error: 'The import could not be saved. Your existing data is unchanged; please retry.' }, 503);
        }
    }
    return { POST };
}
