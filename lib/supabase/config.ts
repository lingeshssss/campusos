// Public Supabase client configuration. These two values are designed to be visible in the browser;
// the publishable key only grants what RLS and grants allow (nothing on CampusOS tables).
// Literal process.env.NEXT_PUBLIC_* references are required so Next.js can inline them at build time.
export function supabasePublicConfig(): { url: string; key: string } | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
    return url && key ? { url, key } : null;
}
