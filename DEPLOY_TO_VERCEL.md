# Deploy CampusOS to Vercel with Supabase

This guide takes CampusOS from this folder to a live site on Vercel. Supabase provides the database and sign-in. Do the steps in order. Expect about an hour the first time. Everything here works on the free plans of Supabase, Vercel, Google Cloud and GitHub, so nothing needs to be purchased.

**Two Google setups, two different callbacks.** People mix these up most often:

| Purpose | Where the Google OAuth client is entered | Redirect URI to register in Google |
| --- | --- | --- |
| **Sign in with Google** (who you are) | Supabase → Authentication → Providers → Google | `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback` |
| **Google Calendar sync** (optional, inside the app) | Vercel env vars `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `https://YOUR-PRODUCTION-DOMAIN/api/google/oauth/callback` |

Use **two separate OAuth clients** (they can live in the same Google Cloud project). Signing in with Google never grants Calendar access. Calendar is a separate, explicit step inside the app.

**Secrets:** never paste keys, passwords or connection strings into chat, GitHub issues or source files. They go only in `.env.local` on your computer, which git ignores, and in Vercel's Environment Variables settings.

---

## 0. Install the tools on your computer

1. Install **Node.js 24 LTS** from https://nodejs.org (any version ≥ 22.13 works).
2. Install pnpm, the package manager this project uses:
   ```bash
   npm install -g pnpm@11.25.0
   ```
3. Open a terminal in this folder (the one containing `package.json`) and install dependencies exactly as locked:
   ```bash
   pnpm install --frozen-lockfile
   ```

## 1. Create the Supabase project

1. Sign in at https://supabase.com/dashboard and choose **New project**.
2. Name it `campusos`, choose a region near you, and set a **database password**. Save the password in your password manager; you need it in step 2.
3. Wait until the project finishes provisioning.

## 2. Collect the values you need

In your Supabase project:

| Value | Where to find it | Variable |
| --- | --- | --- |
| Project URL | **Connect** button at the top of the project (App Frameworks), or Project Settings → Data API | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (starts with `sb_publishable_`) | Project Settings → **API Keys**. Older projects show a legacy `anon` key, which also works here | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Transaction pooler connection string (port **6543**) | **Connect** → Connection string → *Transaction pooler* | `DATABASE_URL` |
| Session pooler connection string (port **5432**) | **Connect** → Connection string → *Session pooler* | `DATABASE_MIGRATION_URL` |

Replace `[YOUR-PASSWORD]` in both connection strings with your database password. If the password contains characters like `@ : / ? # %`, URL-encode them (for example `@` becomes `%40`), or reset the password to letters and digits under Project Settings → Database.

Do **not** use the `service_role` / secret key anywhere. CampusOS does not need it.

## 3. Store local settings

```bash
cp .env.example .env.local
```

Open `.env.local` in your editor and fill in the four values from step 2. Leave `APP_ORIGIN=http://localhost:3000`. Leave the Google and OpenAI lines blank for now. `.env.local` is ignored by git.

## 4. Create the database tables

```bash
pnpm db:migrate
```

This applies the two migrations in `drizzle/` using `DATABASE_MIGRATION_URL`:

- `0000_init_postgres.sql` creates `student_states`, `google_connections`, `google_oauth_attempts`, `google_sync_plans` and `ai_parse_usage`. Every table is owned by a Supabase user and deleted with that user, with Row Level Security enabled.
- `0001_lock_down_data_api.sql` revokes the default `anon`/`authenticated` grants, so the public key cannot read these tables.

Then confirm the lock-down against your live project:

```bash
pnpm db:check-access
```

Every table should print `OK … permission denied`. Migrations are recorded in the `drizzle.__drizzle_migrations` table, so running `pnpm db:migrate` again is safe. Migrations never run automatically during builds or requests. Run this command yourself whenever `drizzle/` gains a new file.

> The old `docs/legacy-d1-migrations/` files are SQLite migrations from the ChatGPT Sites version. They are kept for reference only and must not be run against Postgres.

## 5. Configure email sign-in

In Supabase → **Authentication**:

1. **Sign In / Providers → Email**: keep Email enabled. Keep **Confirm email** on (recommended). New users must click the link in their email before signing in.
2. **URL Configuration**:
   - **Site URL**: `http://localhost:3000` for now (you change it in step 12).
   - **Redirect URLs**: add `http://localhost:3000/**`.
3. Recommended (**Email Templates**): make the links work even when opened on a different device or browser than the one used to sign up. Edit two templates and replace the link's `{{ .ConfirmationURL }}` with:
   - *Confirm signup*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   - *Reset password*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

   If you skip this, the default links still work when opened in the same browser. They return through `/auth/callback`.
4. Supabase's built-in email sender is meant for testing and is heavily rate-limited. Before inviting other students, set up custom SMTP under Authentication settings. Many email providers have free tiers.

How the flows work in the app:

- **Sign up** (`/signup`) → "Check your email" screen with a resend button → the confirmation link signs you in and opens CampusOS.
- **Forgot password** (`/forgot-password`) → email link → `/update-password` to choose a new one. **Settings → Change password** uses the same page while signed in.
- **Expired or used links** return to `/login` with an explanation.
- **Expired sessions**: pages redirect to `/login`. If a save fails because the session ended, the app keeps your unsaved edits on screen and links to sign in again in a new tab.

## 6. Configure "Sign in with Google" (optional)

1. Open https://console.cloud.google.com, then create or select a project.
2. **Google Auth Platform → Branding / Audience**: set the app name and support email. While the app is in *Testing*, add yourself and any testers under **Test users**.
3. **Google Auth Platform → Data Access**: the scopes needed are `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. Do **not** add Calendar here.
4. **Google Auth Platform → Clients → Create client → Web application**, named `CampusOS sign-in`:
   - Authorized JavaScript origins: `http://localhost:3000` (add your production origin in step 12).
   - Authorized redirect URIs: the **Callback URL** shown on Supabase → Authentication → Sign In / Providers → **Google**. It looks like `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.
5. Paste the client ID and secret into that Supabase Google provider page and enable it.

The **Continue with Google** button on `/login` and `/signup` then works. Google returns to Supabase, Supabase returns to `/auth/callback`, and you land in CampusOS.

## 7. Run locally

```bash
pnpm dev
```

Open http://localhost:3000. You should be redirected to the sign-in page. Create an account, confirm the email, and complete onboarding. Refresh to confirm your class persisted.

Useful checks:

```bash
pnpm typecheck
pnpm lint
pnpm test        # 95 tests, including real-Postgres tests of ownership, imports and grants
pnpm build
```

## 8. Push the source to a private GitHub repository

This folder is already a git repository with commits. Create an **empty, private** repository named `campusos` on GitHub (no README or .gitignore), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/campusos.git
git push -u origin main
```

Never add `.env.local` or your `campusos-data.json` export to the repository. Both are ignored by `.gitignore`.

## 9. Import the repository into Vercel

1. At https://vercel.com, choose **Add New… → Project** and import the `campusos` GitHub repository.
2. **Framework Preset**: Next.js (auto-detected). **Root Directory**: the repository root (`./`). Leave the build, output and install commands at their defaults. Vercel detects pnpm from `pnpm-lock.yaml`.

## 10. Set environment variables in Vercel

Before the first deploy, open **Environment Variables** (on the import screen, or later in Project Settings → Environment Variables). Add each value and select the environments it applies to:

| Variable | Production | Preview | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | see Previews below | Public. Baked in at build time |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | see Previews below | Public. Baked in at build time |
| `DATABASE_URL` | ✅ | see Previews below | **Secret.** Transaction pooler, port 6543 |
| `APP_ORIGIN` | ✅ | ❌ | Exact production origin, e.g. `https://campusos-you.vercel.app` (finalized in step 12) |
| `GOOGLE_CLIENT_ID` | optional | ❌ | Calendar client only (step 13) |
| `GOOGLE_CLIENT_SECRET` | optional | ❌ | **Secret** |
| `TOKEN_ENCRYPTION_KEY` | optional | ❌ | **Secret.** Needed with the Google values |
| `OPENAI_API_KEY` | optional | ❌ | **Secret.** Enables AI syllabus parsing |
| `OPENAI_MODEL` | optional | ❌ | Defaults to `gpt-4.1-mini` |

`DATABASE_MIGRATION_URL` is **not** needed in Vercel; migrations run from your computer. The optional iPhone app adds `IOS_BUNDLE_ID`, `APPLE_TEAM_ID`, `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY` and `SUPPORT_EMAIL` (see IOS_APP.md). Mark secrets as **Sensitive** if Vercel offers it.

## 11. Deploy

Click **Deploy**. When it finishes, open the deployment URL. If you haven't set `APP_ORIGIN` yet, sign-in and data still work. Only Calendar shows "setup needed".

## 12. Set the final production origin and auth allowlist

1. Decide your production address: the stable `https://<project>.vercel.app` domain shown under Project → Settings → Domains, or a custom domain you add there.
2. Vercel → Environment Variables: set `APP_ORIGIN` (Production) to exactly that origin, e.g. `https://campusos-you.vercel.app`. Use no trailing path, and `https://` is required.
3. Supabase → Authentication → **URL Configuration**:
   - **Site URL**: your production origin.
   - **Redirect URLs**: add `https://YOUR-PRODUCTION-DOMAIN/**`. Keep `http://localhost:3000/**` for local development.
4. If you set up Google sign-in, add the production origin to that client's **Authorized JavaScript origins**. Its redirect URI stays the Supabase callback.

## 13. Configure Google Calendar sync (optional)

1. In the same Google Cloud project, **APIs & Services → Library**: enable **Google Calendar API**.
2. **Google Auth Platform → Data Access**: add the scope `https://www.googleapis.com/auth/calendar.app.created`. It lets CampusOS manage only calendars it creates, not your primary calendar. While in *Testing*, only listed test users can connect. Public use may require Google verification.
3. **Clients → Create client → Web application**, named `CampusOS Calendar`. This must be a different client from sign-in. **Authorized redirect URIs**:
   - Production: `https://YOUR-PRODUCTION-DOMAIN/api/google/oauth/callback`
   - Local development (optional): `http://localhost:3000/api/google/oauth/callback`
4. Generate the token-encryption key on your computer:
   ```bash
   openssl rand -base64 32
   ```
   This is base64 of 32 random bytes. It encrypts stored Google refresh tokens with AES-256-GCM, bound to each user's ID. Keep it secret, and use a different value for local development and production. **Rotation:** changing it makes every saved Calendar connection unreadable. The app then asks each user to reconnect, and their calendars and events in Google are unaffected. Losing it has the same effect. No other data depends on it.
5. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` to Vercel for **Production only**. For local testing, put a separate set in `.env.local` with `APP_ORIGIN=http://localhost:3000`.

Calendar OAuth runs only when the request's origin equals `APP_ORIGIN`. State cookies are `Secure` everywhere except plain `http://localhost`. Missing or invalid values never break the app: Calendar sync explains which setting is missing, and `.ics` export keeps working.

## 14. Redeploy after environment changes

Vercel applies environment variable changes only to new deployments, and `NEXT_PUBLIC_*` values are compiled into the build. After any change, go to **Deployments**, open the latest production deployment's **⋯** menu and choose **Redeploy**, or push a new commit.

## 15. Sign in and import your old CampusOS data

1. If you haven't already, download your data from the old app: **Settings → Download my data**. That gives you `campusos-data.json`. Pause any running focus timer first.
2. On the new site, create your account and sign in. Onboarding is optional before importing.
3. **Settings → Bring your data over**. Click **Download my current data first** if this account already has anything. Then **Choose export file**.
4. Review the preview: counts of classes, deadlines, books, grade records, planner courses, study blocks, flashcards and sessions, compared with what you have now.
5. Tick "I understand this replaces all of my current CampusOS data" and choose **Replace my data**.

What import does:

- **Replaces, never merges.** Your account's whole state becomes the file's state.
- Saves under **your signed-in account** only. Any user IDs, tokens or unknown fields in the file are discarded.
- Accepts `campusos-student-data` schema version 7 files up to 3 MB. Invalid, newer or older files are rejected with an explanation, and nothing changes.
- A focus timer that was running in the export is imported **paused**, counting time only up to the export moment, so no surprise multi-day session is logged.
- If anything was saved (in any tab) after your preview, the import is refused. Preview again.

Your data is migrated only once this succeeds and the app shows your classes.

## 16. Reconnect Google Calendar and verify

Google tokens from the ChatGPT-hosted version are **not** imported, by design. Reconnect:

1. **Before connecting**, open Google Calendar. Your old "CampusOS" calendar and its events still exist and are not managed by the new app. Delete or hide that calendar to avoid duplicates.
2. CampusOS → **Calendar sync** → tick the permission box → **Continue to Google** → approve.
3. **Create CampusOS calendar** → **Preview sync changes** → review → approve. Changes apply in batches of up to 20.
4. **Disconnect** revokes access. Events already in Google stay.

---

## Preview deployments

Vercel builds a Preview deployment for every branch and pull request, at an unpredictable `*.vercel.app` address. CampusOS is built so that previews can't wander into production flows:

- **Google Calendar is disabled on previews.** The OAuth flow runs only when the request origin equals `APP_ORIGIN` (your production origin), so a preview shows "Calendar sync runs on the main CampusOS site" with a link. Don't give Preview the Google variables.
- **Sign-in and data:** choose one option.
  - *Simplest (recommended):* don't add Supabase or database variables to **Preview**. Previews then build and show "Sign-in is not configured for this deployment". That's safe, and good enough to check that a branch builds.
  - *Fully working previews:* create a **second Supabase project** (e.g. `campusos-preview`), run `pnpm db:migrate` against it, and give its three values to the **Preview** environment only. In that project's URL Configuration, add `https://*-YOUR-VERCEL-TEAM-SLUG.vercel.app/**` to Redirect URLs. Real student data stays out of previews.
  - Pointing previews at the production database is possible but not recommended. Previews would then read and write real accounts.
- Previews never share `APP_ORIGIN`, so production OAuth redirects and cookies are never issued for a preview host.

## What runs where (security model)

- **Identity:** every server route calls `getSessionUser()` (`lib/supabase/server.ts`), which verifies the Supabase access token with `auth.getClaims()`. `proxy.ts` refreshes session cookies on each request and redirects signed-out page visits to `/login`. No route reads identity from request headers or bodies. The old `oai-authenticated-user-*` headers are ignored.
- **Data access:** routes query Postgres through `DATABASE_URL`. That role bypasses RLS, so ownership is enforced in code: every query filters by the verified user ID (`lib/server/state-store.ts`, `lib/google-server.ts`, `lib/server/routes/*`). The tests check this against real Postgres.
- **Public key:** RLS is enabled with no policies and grants are revoked, so the publishable key in the browser cannot read CampusOS tables. `pnpm db:check-access` verifies this on your project.
- **Writes** require a same-origin `Origin` header. State saves use optimistic version checks.
- **AI parsing** runs only in `/api/parse` for signed-in users. It's capped at 20 AI calls per user per hour, counted in Postgres. It times out after 45 seconds and falls back to the built-in extractor on any failure.
- **Redirects** after sign-in accept only same-site relative paths (`lib/safe-redirect.ts`).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Sign-in is not configured for this deployment" | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` missing for this environment. Add them, then redeploy |
| "Unable to load your data" right after sign-in | `DATABASE_URL` missing or wrong, or migrations not run. Check the Vercel function logs |
| `prepared statement … does not exist` | `DATABASE_URL` must be the transaction pooler (6543). The app already disables prepared statements |
| Confirmation or reset link says it expired | Links are single-use and short-lived. Request a new one. Opening a link in a different browser needs the template change in step 5.3 |
| Google sign-in returns `redirect_uri_mismatch` | The sign-in client's redirect URI must be the **Supabase** callback (step 6) |
| Calendar connect returns `redirect_uri_mismatch` | The Calendar client's redirect URI must be `APP_ORIGIN/api/google/oauth/callback`, character for character |
| Calendar says "setup is needed" and lists variables | Add exactly those server variables (Production), then redeploy |
| `pnpm db:migrate` can't connect | Use the Session pooler string (port 5432) for `DATABASE_MIGRATION_URL`. The direct `db.*.supabase.co` host needs IPv6 |

## Commands reference

```bash
pnpm install --frozen-lockfile   # install exactly the locked dependencies
pnpm dev                         # local development at http://localhost:3000
pnpm build && pnpm start         # production build and server
pnpm typecheck                   # TypeScript
pnpm lint                        # ESLint
pnpm test                        # all unit and integration tests
pnpm db:generate                 # create a new migration after editing db/schema.ts
pnpm db:migrate                  # apply migrations (uses DATABASE_MIGRATION_URL)
pnpm db:check-access             # confirm the public key cannot read CampusOS tables
```

## Official references (checked 2026-10-14)

- Next.js on Vercel: https://vercel.com/docs/frameworks/full-stack/nextjs
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Supabase SSR auth for Next.js: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase Google sign-in: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase connection strings: https://supabase.com/docs/guides/database/connecting-to-postgres
- Drizzle with Supabase: https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase
- Google OAuth for web servers: https://developers.google.com/identity/protocols/oauth2/web-server
- Google Calendar API scopes: https://developers.google.com/workspace/calendar/api/auth
