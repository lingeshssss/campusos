# Take CampusOS out of ChatGPT

## What you have

T king login or database access. The Vercel migration described below has not been implemented or deployed.

## 1. Download your source and student data

Unzip `campusos-source-phase7.zip` on your computer. The `campusos/` directory is the source project; open it in VS Code.

In the live CampusOS app, open **Settings → Download my data**. This downloads `campusos-data.json`, containing your saved profile, courses, deadlines, book records, grades, next-semester planner and study tools. It does not contain Google refresh tokens, OAuth secrets, active Google sync plans or ChatGPT account identifiers. Keep personal data outside your Git repository. Pause any running focus timer before exporting.

The source code and student data are separate exports. Download both before retiring the hosted app. A data importer must validate `state` with `lib/model.ts` and save it under your new authenticated user ID. No import endpoint has been added yet; do not assume the JSON automatically loads on Vercel.

## 2. Create your own GitHub repository

Create a private, empty repository named `campusos` in GitHub. From the extracted `campusos` folder, run the following, replacing YOUR_USERNAME with your GitHub username:

```bash
git init
git add .
git commit -m "Export CampusOS phases 1–7"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/campusos.git
git push -u origin main
```

This creates an independent source repository. It does not transfer the hosted database or authentication. The included `.gitignore` excludes environment files; keep downloaded personal data out of the folder entirely.

## 3. Port the hosting-specific pieces

A practical destination is standard Next.js on Vercel, with a managed Postgres database and a verified authentication provider (for example, Supabase Postgres + Supabase Auth). These are architectural choices for the migration, not services already provisioned.

| Current piece | Required change before Vercel deployment |
| --- | --- |
| `package.json`, `vite.config.ts`, `build/`, `scripts/` | Replace the Vinext/Sites build with standard Next.js App Router. Use Next's supported Node runtime and standard dev/build/start scripts. Remove Sites-only plugins and Cloudflare build/runtime imports from the deployed dependency graph. Regenerate a consistent lockfile. |
| `db/index.ts` | Replace `drizzle-orm/d1` and `env.DB` with the chosen managed database driver and server-only connection credentials. |
| `db/schema.ts`, `drizzle/` | If using Postgres, port SQLite table declarations to Drizzle's Postgres equivalents and create Postgres migrations. Preserve the existing state payload, version-based optimistic locking, user ownership, Google sync locks and expiry fields. Do not run SQLite migrations directly against Postgres. |
| `app/chatgpt-auth.ts`, `app/page.tsx`, sign-in/sign-out links | Implement verified session authentication. Map the provider's authenticated user ID to stored records. **Never trust caller-supplied `oai-authenticated-user-*` headers outside the ChatGPT hosting boundary.** Replace ChatGPT-specific auth URLs. |
| `app/api/parse/route.ts`, `lib/google-server.ts` | Read server secrets from the target runtime's environment instead of `cloudflare:workers`. Keep all parsing/AI requests server-side. |
| `lib/google-server.ts` | Replace the hardcoded Site origin with a validated server-only `APP_ORIGIN` for the new production hostname. Keep origin checks, PKCE, state cookies, user authorization and encrypted refresh tokens. |
| `app/api/state/route.ts` and every private API | Preserve authenticated user scoping, same-origin checks, schema validation and concurrency handling under the new auth/database adapters. |
| Data migration | Add a validated import for your exported student `state` under your new user ID. Reconnect Google Calendar instead of copying encrypted tokens. Existing external calendars remain in Google; review them before creating/syncing another calendar to avoid duplicates. |

Use standard Next scripts in the migrated package:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

Changing scripts alone is not the migration. Complete database, auth and runtime changes first. The export's existing `pnpm build` and development helpers target the original Sites/Cloudflare environment.

The React feature components in `app/`, calculation modules in `lib/`, university dataset, PDF assets and tests can largely be reused. Keep `public/pdfjs` assets and their licenses together. Most personal app data is one validated state payload, which simplifies migration.

## 4. Configure the new services and Vercel

After the port builds locally:

1. Create the managed database/auth project and run its new migrations. Configure email and/or Google sign-in according to that provider's instructions.
2. In Vercel, choose **Add New → Project**, import your GitHub `campusos` repository, select the **Next.js** framework and the repository root.
3. Add the environment variables expected by the migrated code in **Project Settings → Environment Variables**, separately for Preview and Production as needed. Typical server-only variables include `DATABASE_URL`, auth-provider server credentials, `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and optional `OPENAI_API_KEY`/`OPENAI_MODEL`. Exact auth names depend on your chosen implementation.
4. Never prefix a secret with `NEXT_PUBLIC_`. Public auth client configuration can be exposed only where your provider explicitly requires it. Put secrets in Vercel's secure settings, not source or chat.
5. Deploy a preview and verify login, signed-out API rejection, per-user isolation, state saves, PDF fallback, calculations, study tools and data import. Run the included tests and a standard Next production build after the migration.
6. Assign your final production URL/domain. Set `APP_ORIGIN` to that exact HTTPS origin and register `https://YOUR-DOMAIN/api/google/oauth/callback` in your Google OAuth client's authorized redirect URIs. Also configure your auth provider's distinct sign-in callback URLs. The two OAuth flows serve different purposes.
7. Redeploy after environment changes. Sign in to the new app, import your data, then explicitly connect Google Calendar and review sync changes.

Your Vercel project's URL will be different from the existing ChatGPT Site URL. Google redirect URIs must match the deployment used for OAuth; do not use arbitrary preview URLs unless registered and deliberately configured.

## Verification status

The Phase 7 source passes TypeScript checks, all 74 unit tests and its existing Cloudflare/Vinext production build. The Vercel/Postgres/auth-provider port is not implemented or tested. Browser QA was unavailable for this build. Optional live integrations still require their own runtime credentials; exporting code does not activate them.

## Official references (checked October 14, 2026)

- Next.js on Vercel: https://vercel.com/docs/frameworks/full-stack/nextjs
- Import a Git repository: https://vercel.com/docs/git
- Environment variables: https://vercel.com/docs/environment-variables
- Supabase server-side authentication for Next.js: https://supabase.com/docs/guides/auth/server-side/nextjs

Begin with the source/data downloads. The next implementation task is to convert this repository to standard Next.js and a chosen database/auth provider before importing it into Vercel.
