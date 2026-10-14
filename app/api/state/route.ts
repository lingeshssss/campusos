import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { studentStates } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { stateSchema } from '../../../lib/model';
export async function GET() {
    const user = await getChatGPTUser();
    if (!user)
        return Response.json({ error: 'Sign in to access your campus.' }, { status: 401 });
    try {
        const [row] = await getDb().select().from(studentStates).where(eq(studentStates.userId, user.userId));
        return Response.json({ state: stateSchema.parse(row ? JSON.parse(row.payload) : { profile: null, courses: [] }), version: row?.version ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch {
        return Response.json({ error: 'Unable to load your data. Please retry.' }, { status: 503 });
    }
}
export async function PUT(request: Request) {
    const user = await getChatGPTUser();
    if (!user)
        return Response.json({ error: 'Sign in to save your campus.' }, { status: 401 });
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin)
        return Response.json({ error: 'Invalid request origin' }, { status: 403 });
    try {
        const raw = await request.text();
        if (raw.length > 3000000)
            return Response.json({ error: 'Request too large' }, { status: 413 });
        const body = JSON.parse(raw);
        const [prior] = await getDb().select().from(studentStates).where(eq(studentStates.userId, user.userId));
        const previous = prior ? JSON.parse(prior.payload) : {};
        // Older open tabs must not erase newly added Phase 2 fields.
        const parsed = stateSchema.safeParse({ ...body.state, study: body.state?.study ?? previous.study, planner: body.state?.planner ?? previous.planner, gradeCourses: body.state?.gradeCourses ?? previous.gradeCourses ?? [], gpaSettings: body.state?.gpaSettings ?? previous.gpaSettings, books: body.state?.books ?? previous.books ?? [], deadlines: body.state?.deadlines ?? previous.deadlines ?? [], grading: body.state?.grading ?? previous.grading ?? [] });
        if (!parsed.success || !Number.isInteger(body.version) || body.version < 0)
            return Response.json({ error: parsed.success ? 'Invalid version' : parsed.error.issues[0].message }, { status: 400 });
        const db = getDb(), values = { payload: JSON.stringify(parsed.data), updatedAt: new Date().toISOString(), version: body.version + 1 };
        const rows = body.version === 0 ? await db.insert(studentStates).values({ ...values, userId: user.userId }).onConflictDoNothing().returning() : await db.update(studentStates).set(values).where(and(eq(studentStates.userId, user.userId), eq(studentStates.version, body.version))).returning();
        if (!rows.length)
            return Response.json({ error: 'Your data changed in another tab. Reload before editing.' }, { status: 409 });
        return Response.json({ version: values.version });
    }
    catch {
        return Response.json({ error: 'Could not save. Your changes are still here; please retry.' }, { status: 503 });
    }
}
