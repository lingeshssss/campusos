import universities from '../../../lib/universities.json';
export function GET(request: Request) { const q = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 100).toLowerCase(); return Response.json(universities.filter(u => u.name.toLowerCase().includes(q) || u.domain.includes(q)).slice(0, 30), { headers: { 'Cache-Control': 'public, max-age=86400' } }); }
