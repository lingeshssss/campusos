# Activate CampusOS Google Calendar sync

Calendar sync is optional. Without it, the rest of CampusOS works and `.ics` export stays available. Step-by-step console instructions are in [DEPLOY_TO_VERCEL.md](./DEPLOY_TO_VERCEL.md#13-configure-google-calendar-sync-optional). This page summarizes the setup and documents the sync behavior.

## Setup summary

1. Enable **Google Calendar API** in a Google Cloud project you control, configure Google Auth Platform branding/audience (add test users while in Testing), and add the `https://www.googleapis.com/auth/calendar.app.created` scope.
2. Create a dedicated OAuth client of type **Web application** for Calendar. It must be separate from the "Sign in with Google" client, which is configured inside Supabase. Authorized redirect URIs:
   - `https://YOUR-PRODUCTION-DOMAIN/api/google/oauth/callback`
   - optionally `http://localhost:3000/api/google/oauth/callback` for local development
3. Set these **server-only** environment variables (Vercel: Production only; locally: `.env.local`), then redeploy:
   - `APP_ORIGIN`: the exact origin, e.g. `https://campusos.example.com`. The redirect URI is derived from it and validated: `https://` is required except for `http://localhost`.
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `TOKEN_ENCRYPTION_KEY`: generate with `openssl rand -base64 32`
4. Open CampusOS → **Calendar sync**, tick the permission box, **Continue to Google**, then **Create CampusOS calendar** and **Preview sync changes**. Approve each batch of up to 20 changes.

The flow runs only when the request origin equals `APP_ORIGIN`. Vercel Preview URLs and other hosts show a notice instead of starting OAuth. If a variable is missing, Calendar sync lists which one; nothing crashes.

**Moving from the ChatGPT-hosted version:** Google tokens were not exported and cannot be imported. Reconnect here. Your old "CampusOS" calendar and events still exist in Google and are not managed by this version, so review or delete them before creating a new calendar to avoid duplicates.

## Behavior

- Classes are recurring weekly series bounded by semester dates, using the student's IANA timezone. Holidays are not excluded automatically.
- Open deadlines are individual events. Exams/papers get popup reminders 10,080 and 1,440 minutes before; other deadlines get 1,440-minute reminders. Untimed deadlines are all-day events.
- Sync runs only on explicit approval. Changing CampusOS data does not immediately write to Google.
- Only known events tagged as owned by this CampusOS account are managed. Unchecked data groups are untouched. Selected groups remove their completed/deleted CampusOS items. Edits made directly to managed Google events may be replaced after approval.
- Existing events are compared before updates. Event etags guard concurrent changes. Preview tokens are single-use, account-bound, expire after five minutes, and become stale when CampusOS data changes.
- Reserved provider event IDs let the next preview reconcile an interrupted insert. Partial successes remain; failed writes are never automatically replayed.
- Google Calendar notification settings determine delivery on your devices. CampusOS does not send invitations or emails.

## Security and recovery

Refresh tokens and PKCE verifiers are encrypted with AES-256-GCM and authenticated to the CampusOS (Supabase) user ID. The key comes from the dedicated server-only `TOKEN_ENCRYPTION_KEY`, not the Google client secret, so rotating the client secret does not invalidate connections. Rotating or losing `TOKEN_ENCRYPTION_KEY` makes saved connections unreadable, and users must reconnect. Their Google calendars are unaffected. Tokens are never sent to the browser. OAuth uses PKCE, single-use expiring state stored hashed in Postgres and bound to the user, an HttpOnly `SameSite=Lax` state cookie (`Secure` except on `http://localhost`), and explicit consent. Calendar ownership markers use a hash of the user ID that does not depend on the hostname, so changing domains does not orphan managed events. Per-user locks and single-use sync plans live in Postgres, so they work across serverless instances.

If calendar creation times out, CampusOS does not blindly create another calendar. Find any new CampusOS calendar in Google Calendar settings, copy its Calendar ID, and use **Verify and recover calendar**. The app verifies its ownership marker before linking it. If you have checked and no calendar was created, explicitly confirm that fact to allow a fresh creation attempt.

Disconnect removes the local authorization and attempts provider revocation. Existing calendar events remain. If provider revocation cannot be confirmed, remove CampusOS from https://myaccount.google.com/connections. Reconnect the same Google account to preserve event mappings.

## Verification limits

Automated tests cover recurring payloads, reminders, duplicate prevention, uncertainty recovery, ownership isolation, deletion boundaries, timestamp equivalence and token encryption. They also cover the OAuth start/callback handlers with a mocked Google token endpoint: state hashing and single use, cookie flags, user binding, origin and preview refusal, encrypted storage, and disconnect. Live Google OAuth and live Calendar writes remain unverified until credentials are configured and a user grants consent.

## Official references

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/auth
- https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert
- https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- https://developers.google.com/workspace/calendar/api/v3/reference/events/update
