# CampusOS

Mobile-first college companion: onboarding with a searchable U.S. university dataset, class schedules and a daily dashboard, syllabus/deadline import with review, `.ics` export, optional Google Calendar sync, textbooks, grades and GPA, a next-semester planner, study blocks, a Pomodoro timer, flashcards, and data export/import.

**Stack:** Next.js 16 (App Router, Node runtime) on Vercel · Supabase Auth (email/password + Google) via `@supabase/ssr` · Supabase Postgres via Drizzle ORM + postgres.js · Zod validation. Originally built for ChatGPT Sites (Vinext, Cloudflare D1, ChatGPT identity headers). Those runtime pieces have been removed.

## Quick start

Requirements: Node ≥ 22.13 (24 LTS recommended) and pnpm 11 (`npm install -g pnpm@11.25.0`).

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local      # fill in Supabase values (see DEPLOY_TO_VERCEL.md steps 1–3)
pnpm db:migrate                 # create tables in your Supabase Postgres
pnpm db:check-access            # confirm the public key cannot read private tables
pnpm dev                        # http://localhost:3000
```

Full setup and deployment, including Supabase, Google sign-in, Google Calendar, Vercel and data import: **[DEPLOY_TO_VERCEL.md](./DEPLOY_TO_VERCEL.md)**.

The iPhone app (React + Capacitor, bundled client sharing `shared/` and `lib/` with the website): **[IOS_APP.md](./IOS_APP.md)**. Commands: `pnpm mobile:build`, `pnpm ios:sync`, `pnpm ios:open`.

## Checks

```bash
pnpm typecheck   # TypeScript
pnpm lint        # ESLint
pnpm test        # node:test: calculations, scheduling, parsing, study, plus server tests on real Postgres (PGlite)
pnpm build       # production Next.js build (works with no environment variables set)
```

Server tests (`tests/server.test.mjs`, `tests/postgres-driver.test.mjs`) run the actual route handlers against an in-process Postgres engine migrated with `drizzle/`. They cover anonymous rejection, forged legacy headers, cross-user isolation, version conflicts, import validation and ownership, the AI quota, Google OAuth state/origin handling, Data API grants and RLS, and the postgres.js driver path. Supabase Auth itself is injected in these tests, so live sign-in still needs a real Supabase project.

## Environment variables

| Variable | Scope | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public (browser) | yes |
| `DATABASE_URL` (transaction pooler, 6543) | server secret | yes |
| `DATABASE_MIGRATION_URL` (session pooler/direct) | local CLI only | for `pnpm db:migrate` |
| `APP_ORIGIN` | server | for Google Calendar |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` | server secrets | optional (Calendar sync) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | server secret | optional (AI parsing) |

See `.env.example` for details. Missing optional values never prevent building or starting. The related feature explains what is missing.

## Architecture

- `proxy.ts`: refreshes the Supabase session cookie, redirects signed-out page visits to `/login`, and answers CORS for the iOS app origin (`capacitor://localhost`) on `/api` only.
- `shared/`: UI and the platform adapter used by both the website and the iOS app. `mobile/`: the Vite/Capacitor app shell. `ios/`: the native Xcode project.
- `lib/supabase/`: browser and server Supabase clients. `getSessionUser()` verifies the token with `auth.getClaims()` and is the only identity source.
- `app/login`, `app/signup`, `app/forgot-password`, `app/update-password`, `app/auth/*`: auth screens, the PKCE/OTP callback routes and sign-out.
- `app/api/*/route.ts`: thin wrappers that inject the session user and database into handlers in `lib/server/routes/` (testable without Next.js).
- `db/schema.ts`, `drizzle/`: Postgres schema and migrations. All tables reference `auth.users` with cascade delete, have RLS enabled, and have Data API grants revoked.
- `lib/student-data.ts`: export format and import validation (`campusos-student-data`, schema version 7).
- `docs/legacy-d1-migrations/`: historical SQLite migrations from the Sites version. Do not run them.

## Security and data

Every private endpoint (`/api/state`, `/api/export`, `/api/import`, `/api/parse`, `/api/planner`, `/api/calendar`, `/api/books`, `/api/google/*`) requires a verified Supabase session. Identity is never taken from request headers or bodies. Database queries run through a privileged server connection that bypasses RLS, so every query filters by the session user's ID, and the tests check this. Writes require a same-origin `Origin` header. Student state is one validated JSON document per user (`student_states.payload`, jsonb) with a version number for optimistic concurrency, so a stale tab cannot overwrite newer changes. Older tabs that omit newer fields cannot erase them. No credentials are stored in browser storage. `GET /api/universities?q=...` is public and searches a bundled snapshot of 2,349 U.S. institutions from https://github.com/Hipo/university-domains-list (retrieved 2026-10-14; community-maintained, may include stale entries).

Classes are recurring campus-local weekday/time values. The daily view uses the student's IANA timezone, including daylight-saving changes, and respects semester bounds. Travel time is an explicit user estimate, not routing.

## Appearance and university colors

**Settings → Appearance** offers Light, Dark or System (the default; it follows the device), and University or CampusOS accent colors. The top bar has a quick Light → Dark → System toggle. Choices apply instantly, are cached on the device for the first paint, and are saved to the account (`state.preferences`) so they follow the student. Once the account loads, its choice wins; accounts that never chose use the defaults. Signing out keeps the device's appearance and forgets the school colors.

- `lib/theme/tokens.ts`: semantic tokens (surfaces, text, borders, success/warning/danger/info, course and category colors) for light and dark. Components only use these CSS variables.
- `lib/theme/branding.ts`: verified school colors, matched by exact dataset domain. Each record has the official source URL and the date it was checked. Schools without a record use the CampusOS colors, labeled as such.
- `lib/theme/palette.ts`: turns official colors into accessible accent tokens for each mode. Raw colors are kept, and variants are adjusted only as far as needed for WCAG AA.
- `lib/theme/css.ts` generates `app/theme.css` (`pnpm theme:css`). `lib/theme/boot.ts` applies the cached theme before the first paint (inline on the web; `theme-boot.js` in the iOS app).

To add a school, copy its colors from the university's own brand guide into `branding.ts`, using its exact domain from `lib/universities.json`, then run `pnpm test`. The tests check every pairing for contrast in both modes.

## Feature notes by phase

The notes below describe feature behavior from the original build phases. Where they say "D1" or "user-scoped state", storage is now the Supabase Postgres `student_states` table with the same validation and version checks. Where they say "Sites" or "ChatGPT", read Supabase Auth on Vercel.

## Phase 2 implementation

Phase 2 adds:

- PDF/text syllabus import (PDF.js 5.4.624 assets are bundled locally), up to 5 MB / 60 pages / 100,000 extracted characters.
- `/api/parse`, the single authenticated server-side parsing endpoint for syllabus and quick-add text. Basic extraction works with no provider. An optional server-only OpenAI Responses integration uses structured output and falls back on failure. Set `OPENAI_API_KEY` (server-only) to enable it. Signed-in users are limited to 20 AI calls per hour, counted in Postgres; at the limit, or on any upstream failure, basic extraction is used.
- Editable candidate review, unresolved-date handling, source excerpts, item inclusion controls, and explicit review confirmation. Import never saves dates automatically.
- Separate grading categories and individual assignment weights, exact duplicate prevention, manual add/edit/remove, completion/reopen, and course/date/status filters.
- Dashboard reminders ranked by days until due, assignment type, and individual grade weight, plus a Sunday overview and quick-entry review flow.
- Authenticated `/api/calendar?classes=1` download. The `.ics` contains open deadlines and optional semester class occurrences converted to UTC from the IANA campus timezone. Class events are expanded by date, so daylight-saving changes preserve local class hours. Untimed deadlines are all-day events. Exams/papers have 7-day and 1-day alarms; other deadlines have 1-day alarms. Imported alerts depend on calendar-client support. The app does not send background push/email notifications.

### Data compatibility

The existing SQLite table is preserved. Its JSON payload now includes `deadlines` and `grading` with defaults for Phase 1 records. Older clients omitting these properties cannot erase existing collections. Existing version checks still prevent stale writes. No destructive migration is required.

### Verification and limits

Run `node --experimental-strip-types --test tests/*.test.mjs` (23 tests) and `npx tsc --noEmit --incremental false`. Tests cover backward-compatible state, date inference, quick add, duplicates, category/individual weight separation, daylight-saving transitions, invalid local times, calendar formatting, reminders, and Unicode folding. The production build is also checked. Browser interaction QA is unavailable in the authoring environment.

The basic parser does not guarantee every syllabus date is found. Complex tables, relative/recurring due dates, and scanned PDFs need manual attention. The review screen surfaces uncertainty and undated rows. PDF source files stay on-device; extracted text is processed transiently server-side and saved items retain their short source excerpts. Automatic university academic calendar retrieval is not implemented; paste its text or add academic dates manually. Google OAuth/calendar synchronization is implemented in Phase 3 below, pending credential setup.

`.ics` is a snapshot. Import into a separate CampusOS calendar and replace that calendar on later exports to avoid duplicates/stale events. Holidays are not automatically excluded. Nonexistent daylight-saving local times block export with an actionable error; ambiguous repeated times use the earlier instant.

## Phase 3: Google Calendar synchronization

See [GOOGLE_SETUP.md](./GOOGLE_SETUP.md) for activation and exact OAuth redirect URI. The source implements an explicit Google consent flow, server-side encrypted refresh-token storage, dedicated calendar creation, preview-before-write sync, weekly recurring classes, type-specific deadline reminders, and disconnect/revocation. Credentials are not configured, so hosted users see a clear setup-pending state and retain .ics export.

Connection, expiring OAuth state and single-use sync plan tables are part of the Postgres migration in `drizzle/`.

No Google account data was read and no external events were written during authoring. Live consent and writes require the user's later Google authorization and in-app approval.

## Phase 4 — textbook finder

Open **Textbooks** in the navigation. Add books per course manually or paste syllabus/bookstore text into the review flow. Basic parsing uses `Title | Author | Edition | ISBN` lines or blank-line-separated blocks with `Title:`, `Author:`, `Edition:` and `ISBN:` labels. Review all fields before saving. This parser runs through `/api/parse` and does not call an LLM. Imports are capped at 50 books and deduplicate matching ISBN/course (or title/edition/course).

Authenticated `/api/books?isbn=...` validates ISBN checksums and requests title/author metadata from Open Library with an eight-second timeout. Lookup failure leaves manual entry available. Catalog data is not evidence that a professor requires the book.

Legal free-resource links appear first, with university reserves/interlibrary-loan guidance. Amazon, Chegg/Valore, AbeBooks, eBay, ThriftBooks and VitalSource links support quote collection. No retailer price feeds or automatic availability checks are configured. Students record USD price, shipping, tax, edition, format, checked date and listing URL. Lowest recorded offers are computed per format, with older editions excluded by default and professor-confirmation advice. No fabricated prices, discount percentages or guarantees are shown.

Savings compare only books with a bookstore total and selected quote (or paid purchase total). Actual purchases preserve their own total independently of future quote edits. Owned print purchases have an editable finals-week resale-check date, defaulting to seven days before semester end. Reminders appear in the dashboard within seven days and remain until marked done. No scheduled price monitoring, background notification or guarantee of peak resale value is provided.

Book data uses the existing user-scoped Postgres state with optimistic concurrency and schema validation. Older clients preserve omitted book collections. No schema migration or new secret is required. Type checking and `node --experimental-strip-types --test tests/*.test.mjs` cover ISBN validation, quote comparisons, savings, import and prior phases. Browser QA requires the supported browser skill, which was unavailable for this delivery.

## Phase 5 — grade tracker and GPA

Open **Grades**, then track each academic course once (lecture/lab meetings that share a grade use one record). Configure credits, categories and percentage weights. Saved Phase 2 syllabus categories can be copied into the gradebook for review without replacing existing scores. Log scored assignments with either total-points or equal-assignment weighting within each category. Blank earned points mean ungraded; explicit zero counts as a zero. Save the course to persist edits and update GPA cards.

Current standing renormalizes across categories with scored work and displays their covered category weight; this is not assignment completion. Percentage-to-letter cutoffs are per course and must be confirmed, with a zero cutoff for the lowest letter. The default 90/80/70/60 scale is explicitly an example. Final-exam scenarios require categories totaling 100%, a positive-weight final-only category, and grades in every other weighted category. They replace the selected category with the hypothetical final and hold other category averages constant. Targets above 100% are reported unattainable and targets at/below zero are stated explicitly.

GPA uses credit-weighted letter points. An official entered letter overrides a running estimate. Estimates need confirmed course cutoffs and 100% category weights; all grades need a confirmed school GPA scale. Pass/fail, withdrawal and other excluded courses can be unchecked. Prior transcript GPA credits and quality points are combined with included current-semester records without double counting. A verified Rutgers–New Brunswick SAS letter/point preset is offered, with a source link; other programs can edit the scale. No university-wide percentage thresholds are assumed. Repeats, grade forgiveness, dropped scores, extra credit and curves require manual adjustments and are not automatically modeled.

Attendance scenarios use an explicitly selected model: each absence beyond an allowance removes one equally weighted share of the attendance component. Inputs are bounded and must leave at least one graded meeting. The scenario is separate from logged scores and does not assert that skipping is safe or account for in-class work/mandatory attendance.

The existing authenticated `/api/state` backend persists `gradeCourses` and `gpaSettings` in user-scoped Postgres JSON with optimistic version checks. Defaults preserve prior records, and older tabs preserve omitted Phase 5 fields. No new migration, API key or external service is required. `tests/phase5.test.mjs` tests weighted/equal scoring, missing scores, final scenarios, attendance, GPA, cutoff boundaries and invalid input. TypeScript checks and all 54 tests pass; supported browser QA is unavailable in this environment.

## Phase 6 — next-semester planner

Open **Planner** and enter next-semester candidate courses. Each included course contributes exactly one section bundle to each result. A bundle contains all linked lecture/lab/discussion meetings; enter only combinations the school permits. Asynchronous sections explicitly have no meetings. Unscheduled/TBA meetings should not be marked asynchronous. Current-semester courses are never overwritten by the planner.

The authenticated, same-origin `/api/planner` endpoint validates inputs and exhaustively checks all eligible combinations (maximum 20,000 input combinations, 8 courses, 12 bundles/course). Oversized requests fail with an instruction to narrow inputs; there are no silently truncated results. Results are paginated and all results can be downloaded as JSON. Closed sections are excluded; waitlisted sections are included only when enabled. Constraints cover earliest start, no Fridays, maximum daily class hours and one continuous lunch break inside the chosen window. Compact/spread ranking uses total weekly gaps. Weekly meeting times use the student's configured timezone. Date-range overlap, holidays and travel time inside lunch are not modeled.

Walking/shuttle routes use entered bidirectional times or an explicitly labeled user-configurable fallback. Unknown locations and insufficient transfers generate warnings rather than hard exclusions. Building names are not treated as geographical evidence. Each result shows single-course open-section alternatives that satisfy all time constraints with the rest of the result unchanged. Multiple simultaneous replacements must be regenerated and checked. Saved options preserve section selections and are rechecked against current times/constraints; no enrollment is performed.

Degree progress is a reviewed checklist. Paste one requirement per audit line or enter lines manually, mark completions and map candidate courses to requirements. Prerequisite warnings compare listed required codes against the student's completed courses; OR prerequisites, minimum grades, corequisites and institutional double-counting rules require manual review. Faculty links search RateMyProfessors. Historical section GPA can be entered with a published source URL and term context. There is no live course catalog, seat, rating or grade-distribution API integration.

Planner state persists in existing user-scoped Postgres data through optimistic concurrency. Older tabs preserve omitted planner data; existing records receive safe defaults. No migration or new credential is required. Type checks and all 66 tests cover prior phases plus complete enumeration, linked-meeting conflicts, constraint boundaries, lunch gaps, status filtering, ranking, backups, travel, prerequisites and explicit size limits. Supported browser QA remains unavailable.

## Phase 7 — study tools and portability

Open **Study** for a persistent course-linked focus timer, study-block planning, course totals and flashcards. Preferences include study start/end times, weekdays, block length, daily planned minutes, buffers and Pomodoro durations. Seven-day suggestions fit within the configured semester and campus timezone, avoid classes/travel buffers and existing blocks, and prioritize nearby weighted deadlines. Review suggestions before saving, or add/edit a block manually. Manual entries reject class or saved-block overlaps. Completed blocks do not count as timer sessions.

Focus and break timers persist timestamps on start/pause/resume. They survive navigation/reload and count wall-clock time while closed; the UI explicitly tells students to pause when not studying. The student saves elapsed/completed focus time, with unique session IDs and optimistic concurrency preventing duplicate saves. Breaks never count toward course totals. Sessions can be removed. No background notification or closed-app execution is promised.

Course-organized flashcards implement a simple review ladder: Good advances one box and Easy two, capped at six; intervals are 1/3/7/14/30/60 days. Again resets to box zero, due today. Dates use the profile timezone. Cards support create/edit/delete/reset and due-card review with answer reveal. Dashboard cards show today's blocks and due flashcards, and Sunday links to weekly planning. Study state is validated and stored in the existing user-scoped Postgres state with safe defaults and old-tab preservation.

**Settings → Download my data** uses authenticated `/api/export` to download only validated student state. It excludes credentials and Google token/sync tables. **Settings → Bring your data over** imports such a file after validation, a preview and explicit confirmation. It replaces the signed-in user's data and never imports IDs or tokens; see DEPLOY_TO_VERCEL.md step 15.

Validation: TypeScript, 74 tests and the production build. Tests cover timer pause/resume/reload semantics, duplicate logs, break exclusion, clock rollback, repetition intervals, study windows, buffers, existing blocks and deadline priority. Supported browser QA was unavailable.
