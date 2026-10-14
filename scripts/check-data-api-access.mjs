// Live check against YOUR Supabase project: confirms the public (publishable-key) Data API cannot read
// CampusOS tables. Run after `pnpm db:migrate`:  pnpm db:check-access
// Uses only the public URL and publishable key from .env.local; no secrets are needed or sent.
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ''), key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local first.');
    process.exit(2);
}
const tables = ['student_states', 'google_connections', 'google_oauth_attempts', 'google_sync_plans', 'ai_parse_usage'];
let failed = false;
for (const table of tables) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const body = await res.text();
    if (res.ok) {
        failed = true;
        console.log(`FAIL  ${table}: readable through the Data API (HTTP ${res.status}). Run pnpm db:migrate, and do not add RLS policies for these tables.`);
    } else if (/permission denied|42501/.test(body) || [401, 403].includes(res.status)) {
        console.log(`OK    ${table}: permission denied for the public key (HTTP ${res.status}).`);
    } else if (res.status === 404) {
        console.log(`OK    ${table}: not exposed (HTTP 404). If this is unexpected, confirm migrations ran.`);
    } else {
        failed = true;
        console.log(`CHECK ${table}: unexpected HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
}
process.exit(failed ? 1 : 0);
