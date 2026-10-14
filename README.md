# CampusOS — Phases 1–3

Mobile-first React / Vinext application with server-side routes and Cloudflare D1 (SQLite). Features: authenticated per-user persistence, 3-step onboarding, searchable U.S. university dataset, majors/minors, graduation year, semester dates/timezone, manual class CRUD, conflict warnings, daily dashboard, weekly schedule, and profile settings.

## Run locally

Requirements: Node 22.13+ and npm. Install with `npm install`, then run `npm run db:generate` only when changing the schema. Build with `npm run build`, then initialize your local database before `npm run dev`:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_purple_night_thrasher.sql
```

Apply this migration only once per local database. Run automated checks with `node --experimental-strip-types --test tests/model.test.mjs` and `npx tsc --noEmit`.

 Hosted Sites injects identity headers at the trusted edge. For local testing, use an HTTP client with `oai-authenticated-user-id` and `oai-authenticated-user-email` headers; never expose the local dev server to untrusted traffic. The hosted application rejects missing identity and scopes every record to the authenticated user.

The Sites tooling configures development and deployment. `.openai/hosting.json` declares the D1 binding `DB`. Use the Sites build helper for production packaging. D1 migrations are in `drizzle/`. Runtime database files are not source-controlled.

## Security and data

`GET /api/state` loads the current user's state. `PUT /api/state` validates profile and class fields with Zod, checks request origin, and uses a version number to prevent overwriting newer changes from another tab. State is saved atomically as a bounded JSON document in SQLite. No credentials are stored in browser storage. `GET /api/universities?q=...` searches a bundled snapshot of 2,349 U.S. institutions from https://github.com/Hipo/university-domains-list (retrieved 2026-10-14; dataset is community-maintained and may include stale entries). Manual school name/domain entry is available.

Classes are recurring campus-local weekday/time values. The daily view uses the student's IANA timezone, including daylight-saving changes, and respects semester bounds. Travel time is an explicit user estimate, not routing. Multiple meeting patterns for one course can be entered as separate records using the same course code.

## Current scope and limitations

This hosted edition uses Sites / ChatGPT authentication. Standalone email/password and Google OAuth are not implemented. No Google Calendar consent is requested or calendar connection made in Phase 1. No fabricated personal sample data is inserted.

Onboarding writes on Finish; unfinished setup lives in memory. Saved profile and courses persist server-side. Holidays/exceptions are not automatically excluded. Manual dates must be confirmed with the university. Browser QA is unavailable in this build environment; production compilation and focused model/database checks are used.

## Next phases — require user confirmation before implementation

2. Implemented below: syllabus import, deadline review/timeline, and .ics export. Schedule paste/vision import remains future work.
3. Implemented below: Google Calendar OAuth and sync; activation needs Google Cloud credentials.
4. Textbook finder, legal free sources, real provider pricing and buyback tracking.
5. Grades, GPA, weighted finals and attendance calculations.
6. Next-semester planner, constraints, prerequisites, waitlist backups.
7. Study blocks, Pomodoro tracking, spaced-repetition flashcards.

Dashboard deadlines now use the Phase 2 timeline.

## Phase 2 implementation

Phase 2 adds:

- PDF/text syllabus import (PDF.js 5.4.624 assets are bundled locally), up to 5 MB / 60 pages / 100,000 extracted characters.
- `/api/parse`, the single authenticated server-side parsing endpoint for syllabus and quick-add text. Basic extraction works with no provider. An optional server-only OpenAI Responses integration uses structured output and falls back on failure. No API key is currently configured: the connected plugin's required secure local-write helper was missing in the authoring environment, so no key was created.
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

New schema-only migration `drizzle/0001_parallel_toad.sql` adds connection, expiring OAuth state, and single-use sync plan tables without altering existing student data. Apply it once after the Phase 1 migration in local development; Sites applies hosted migrations on deploy.

Run all tests with `node --experimental-strip-types --test tests/*.test.mjs` (37 tests). No Google account data was read and no external events were written during authoring. Live consent and writes require the user's later Google authorization and in-app approval.

## Phase 4 — textbook finder

Open **Textbooks** in the navigation. Add books per course manually or paste syllabus/bookstore text into the review flow. Basic parsing uses `Title | Author | Edition | ISBN` lines or blank-line-separated blocks with `Title:`, `Author:`, `Edition:` and `ISBN:` labels. Review all fields before saving. This parser runs through `/api/parse` and does not call an LLM. Imports are capped at 50 books and deduplicate matching ISBN/course (or title/edition/course).

Authenticated `/api/books?isbn=...` validates ISBN checksums and requests title/author metadata from Open Library with an eight-second timeout. Lookup failure leaves manual entry available. Catalog data is not evidence that a professor requires the book.

Legal free-resource links appear first, with university reserves/interlibrary-loan guidance. Amazon, Chegg/Valore, AbeBooks, eBay, ThriftBooks and VitalSource links support quote collection. No retailer price feeds or automatic availability checks are configured. Students record USD price, shipping, tax, edition, format, checked date and listing URL. Lowest recorded offers are computed per format, with older editions excluded by default and professor-confirmation advice. No fabricated prices, discount percentages or guarantees are shown.

Savings compare only books with a bookstore total and selected quote (or paid purchase total). Actual purchases preserve their own total independently of future quote edits. Owned print purchases have an editable finals-week resale-check date, defaulting to seven days before semester end. Reminders appear in the dashboard within seven days and remain until marked done. No scheduled price monitoring, background notification or guarantee of peak resale value is provided.

Book data uses the existing user-scoped D1 state with optimistic concurrency and schema validation. Older clients preserve omitted book collections. No schema migration or new secret is required. Type checking and `node --experimental-strip-types --test tests/*.test.mjs` cover ISBN validation, quote comparisons, savings, import and prior phases. Browser QA requires the supported browser skill, which was unavailable for this delivery.

## Phase 5 — grade tracker and GPA

Open **Grades**, then track each academic course once (lecture/lab meetings that share a grade use one record). Configure credits, categories and percentage weights. Saved Phase 2 syllabus categories can be copied into the gradebook for review without replacing existing scores. Log scored assignments with either total-points or equal-assignment weighting within each category. Blank earned points mean ungraded; explicit zero counts as a zero. Save the course to persist edits and update GPA cards.

Current standing renormalizes across categories with scored work and displays their covered category weight; this is not assignment completion. Percentage-to-letter cutoffs are per course and must be confirmed, with a zero cutoff for the lowest letter. The default 90/80/70/60 scale is explicitly an example. Final-exam scenarios require categories totaling 100%, a positive-weight final-only category, and grades in every other weighted category. They replace the selected category with the hypothetical final and hold other category averages constant. Targets above 100% are reported unattainable and targets at/below zero are stated explicitly.

GPA uses credit-weighted letter points. An official entered letter overrides a running estimate. Estimates need confirmed course cutoffs and 100% category weights; all grades need a confirmed school GPA scale. Pass/fail, withdrawal and other excluded courses can be unchecked. Prior transcript GPA credits and quality points are combined with included current-semester records without double counting. A verified Rutgers–New Brunswick SAS letter/point preset is offered, with a source link; other programs can edit the scale. No university-wide percentage thresholds are assumed. Repeats, grade forgiveness, dropped scores, extra credit and curves require manual adjustments and are not automatically modeled.

Attendance scenarios use an explicitly selected model: each absence beyond an allowance removes one equally weighted share of the attendance component. Inputs are bounded and must leave at least one graded meeting. The scenario is separate from logged scores and does not assert that skipping is safe or account for in-class work/mandatory attendance.

The existing authenticated `/api/state` backend persists `gradeCourses` and `gpaSettings` in user-scoped D1 JSON with optimistic version checks. Defaults preserve prior records, and older tabs preserve omitted Phase 5 fields. No new migration, API key or external service is required. `tests/phase5.test.mjs` tests weighted/equal scoring, missing scores, final scenarios, attendance, GPA, cutoff boundaries and invalid input. TypeScript checks and all 54 tests pass; supported browser QA is unavailable in this environment.

## Phase 6 — next-semester planner

Open **Planner** and enter next-semester candidate courses. Each included course contributes exactly one section bundle to each result. A bundle contains all linked lecture/lab/discussion meetings; enter only combinations the school permits. Asynchronous sections explicitly have no meetings. Unscheduled/TBA meetings should not be marked asynchronous. Current-semester courses are never overwritten by the planner.

The authenticated, same-origin `/api/planner` endpoint validates inputs and exhaustively checks all eligible combinations (maximum 20,000 input combinations, 8 courses, 12 bundles/course). Oversized requests fail with an instruction to narrow inputs; there are no silently truncated results. Results are paginated and all results can be downloaded as JSON. Closed sections are excluded; waitlisted sections are included only when enabled. Constraints cover earliest start, no Fridays, maximum daily class hours and one continuous lunch break inside the chosen window. Compact/spread ranking uses total weekly gaps. Weekly meeting times use the student's configured timezone. Date-range overlap, holidays and travel time inside lunch are not modeled.

Walking/shuttle routes use entered bidirectional times or an explicitly labeled user-configurable fallback. Unknown locations and insufficient transfers generate warnings rather than hard exclusions. Building names are not treated as geographical evidence. Each result shows single-course open-section alternatives that satisfy all time constraints with the rest of the result unchanged. Multiple simultaneous replacements must be regenerated and checked. Saved options preserve section selections and are rechecked against current times/constraints; no enrollment is performed.

Degree progress is a reviewed checklist. Paste one requirement per audit line or enter lines manually, mark completions and map candidate courses to requirements. Prerequisite warnings compare listed required codes against the student's completed courses; OR prerequisites, minimum grades, corequisites and institutional double-counting rules require manual review. Faculty links search RateMyProfessors. Historical section GPA can be entered with a published source URL and term context. There is no live course catalog, seat, rating or grade-distribution API integration.

Planner state persists in existing user-scoped D1 data through optimistic concurrency. Older tabs preserve omitted planner data; existing records receive safe defaults. No migration or new credential is required. Type checks and all 66 tests cover prior phases plus complete enumeration, linked-meeting conflicts, constraint boundaries, lunch gaps, status filtering, ranking, backups, travel, prerequisites and explicit size limits. Supported browser QA remains unavailable.

## Phase 7 — study tools and portability

Open **Study** for a persistent course-linked focus timer, study-block planning, course totals and flashcards. Preferences include study start/end times, weekdays, block length, daily planned minutes, buffers and Pomodoro durations. Seven-day suggestions fit within the configured semester and campus timezone, avoid classes/travel buffers and existing blocks, and prioritize nearby weighted deadlines. Review suggestions before saving, or add/edit a block manually. Manual entries reject class or saved-block overlaps. Completed blocks do not count as timer sessions.

Focus and break timers persist timestamps on start/pause/resume. They survive navigation/reload and count wall-clock time while closed; the UI explicitly tells students to pause when not studying. The student saves elapsed/completed focus time, with unique session IDs and optimistic concurrency preventing duplicate saves. Breaks never count toward course totals. Sessions can be removed. No background notification or closed-app execution is promised.

Course-organized flashcards implement a simple review ladder: Good advances one box and Easy two, capped at six; intervals are 1/3/7/14/30/60 days. Again resets to box zero, due today. Dates use the profile timezone. Cards support create/edit/delete/reset and due-card review with answer reveal. Dashboard cards show today's blocks and due flashcards, and Sunday links to weekly planning. Study state is validated and stored in the existing user-scoped D1 state with safe defaults and old-tab preservation.

**Settings → Download my data** uses authenticated `/api/export` to download only validated student state. It excludes credentials and Google token/sync tables. See `EXPORT_TO_VERCEL.md` for the separate source-export and migration instructions. Current deployment requires Sites/Cloudflare adapters; the ZIP is not a drop-in Vercel app.

Validation: TypeScript, 74 tests and the production build. Tests cover timer pause/resume/reload semantics, duplicate logs, break exclusion, clock rollback, repetition intervals, study windows, buffers, existing blocks and deadline priority. Supported browser QA was unavailable.
