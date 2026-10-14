# Activate CampusOS Google Calendar sync

The Phase 3 application code is deployed, but Google OAuth credentials have not been configured. No Google account has been connected and no external calendar/events have been created by the authoring agent.

## One-time app owner setup

1. Open https://console.cloud.google.com/ and choose a Google Cloud project you control.
2. Enable **Google Calendar API** under APIs & Services → Library.
3. In **Google Auth Platform**, configure the app's branding and audience. For a private test app, add the Google accounts that will test CampusOS as test users. Follow the Console's current consent-screen and domain requirements. Public distribution may need Google's verification.
4. Create an OAuth client of type **Web application**. Set this exact authorized redirect URI:

   `https://campusos-daily-lingesh.humblelynx9.chatgpt.site/api/google/oauth/callback`

5. Add the resulting credentials to the CampusOS hosted runtime configuration as server-side secrets:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

   Do not paste secrets into chat, commit them, or put them in client-side code. The current deployment has no Google credentials. The trusted Sites environment-variable tooling can configure them when a secure source is available. Redeploy after configuration so the runtime receives them.
6. Open CampusOS → **Calendar sync**. Check the permission box and choose **Continue to Google**. Authorize the intended Google account. The connection uses the `calendar.app.created`, `openid`, and `email` scopes.
7. Choose **Create CampusOS calendar**, then **Preview sync changes**. Review creates, updates, and removals, check the approval box, and sync. Large change sets are applied in batches of up to 20; refresh and approve the next batch when requested.

For local development, configure an explicitly registered localhost redirect URI and adapt `APP_ORIGIN` / `REDIRECT_URI` in `lib/google-server.ts`. The current constants are pinned to the deployed private origin to prevent request-host manipulation. The app still uses Sites authentication for its own user identity; Google authorization grants Calendar access only.

## Behavior

- Classes are recurring weekly series bounded by semester dates, using the student's IANA timezone. Holidays are not excluded automatically.
- Open deadlines are individual events. Exams/papers get popup reminders 10,080 and 1,440 minutes before; other deadlines get 1,440-minute reminders. Untimed deadlines are all-day events.
- Sync runs only on explicit approval. Changing CampusOS data does not immediately write to Google.
- Only known events tagged as owned by this CampusOS account are managed. Unchecked data groups are untouched. Selected groups remove their completed/deleted CampusOS items. Edits made directly to managed Google events may be replaced after approval.
- Existing events are compared before updates. Event etags guard concurrent changes. Preview tokens are single-use, account-bound, expire after five minutes, and become stale when CampusOS data changes.
- Reserved provider event IDs let the next preview reconcile an interrupted insert. Partial successes remain; failed writes are never automatically replayed.
- Google Calendar notification settings determine delivery on your devices. CampusOS does not send invitations or emails.

## Security and recovery

Refresh tokens and PKCE verifiers are encrypted with AES-GCM and authenticated to the CampusOS user ID. A server-only key is derived from the Google client secret with an application-specific context. Rotating that secret requires reconnecting Google accounts. Tokens are never sent to the browser. OAuth uses PKCE, single-use expiring state, a secure HttpOnly state cookie, and explicit consent.

If calendar creation times out, CampusOS does not blindly create another calendar. Find any new CampusOS calendar in Google Calendar settings, copy its Calendar ID, and use **Verify and recover calendar**. The app verifies its ownership marker before linking it. If you have checked and no calendar was created, explicitly confirm that fact to allow a fresh creation attempt.

Disconnect removes the local authorization and attempts provider revocation. Existing calendar events remain. If provider revocation cannot be confirmed, remove CampusOS from https://myaccount.google.com/connections. Reconnect the same Google account to preserve event mappings.

## Verification limits

Automated tests cover recurring payloads, reminders, duplicate prevention, uncertainty recovery, ownership isolation, deletion boundaries, timestamp equivalence, and token encryption. Schema migrations and production compilation are checked. Live Google OAuth and live Calendar writes remain unverified until credentials are configured and the user grants consent. Browser QA is unavailable in the authoring environment.

## Official references

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/auth
- https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert
- https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- https://developers.google.com/workspace/calendar/api/v3/reference/events/update
