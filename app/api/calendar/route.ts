import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { studentStates } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { stateSchema } from '../../../lib/model';
import { makeCalendar } from '../../../lib/calendar';
export async function GET(request: Request) { const user = await getChatGPTUser(); if (!user)
    return Response.json({ error: 'Sign in to export.' }, { status: 401 }); try {
    const [row] = await getDb().select().from(studentStates).where(eq(studentStates.userId, user.userId));
    if (!row)
        return Response.json({ error: 'Complete onboarding first.' }, { status: 400 });
    const state = stateSchema.parse(JSON.parse(row.payload));
    const out = makeCalendar(state, new URL(request.url).searchParams.get('classes') === '1');
    return new Response(out.content, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="CampusOS-semester.ics"', 'Cache-Control': 'no-store', 'X-CampusOS-Event-Count': String(out.count) } });
}
catch (e) {
    return Response.json({ error: e instanceof Error && e.message.includes('daylight saving') ? e.message : 'Export failed. Verify your semester dates and try deadlines-only export.' }, { status: 400 });
} }
