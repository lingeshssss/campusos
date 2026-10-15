# CampusOS for iPhone

The iOS app is a **separate bundled client** built with React, Vite and Capacitor 8. The app's code ships inside the app (`mobile/dist`), and it never loads the website remotely (there is no `server.url`). It shares the website's UI and business logic and talks to the same backend: the Next.js API on Vercel and Supabase.

Steps marked 🍎 need **your Apple Developer account**. Steps marked 📱 need **your physical iPhone**.

## How it fits together

| Piece | Website | iOS app |
| --- | --- | --- |
| UI and logic | `shared/ui/*`, `lib/*` | same files, bundled by `mobile/vite.config.ts` |
| Platform adapter | `webPlatform` in `shared/platform.ts` | `mobile/src/native-platform.ts` |
| Sign-in | Supabase cookies (`@supabase/ssr`) | Supabase session in the iOS **Keychain** (this-device-only, PKCE) |
| API authentication | session cookie + same-origin check | `Authorization: Bearer <access token>`, verified on the server with `auth.getClaims()` |
| Email confirm / reset links | `/auth/callback`, `/auth/confirm` | universal link `https://YOUR-DOMAIN/auth/mobile-callback` opens the app |
| Google sign-in | Supabase OAuth | Supabase OAuth in an in-app browser sheet returning to `campusos://auth/callback` (optional) |
| Sign in with Apple | n/a | native (`ios/App/App/CampusAppleSignInPlugin.swift`, Apple's AuthenticationServices only) |
| Google Calendar | connect on the site | connect on the site (opens it), then preview/sync from the app |
| Offline | n/a | encrypted local copy; offline edits queued, conflicts resolved explicitly |
| Files | browser download | iOS share sheet; file picker for PDFs and imports |
| Reminders | `.ics` export | local notifications for deadlines and the focus timer (opt-in) |

**Secrets stay on the server.** The app contains only public values: the API origin, Supabase URL and publishable key. Database URLs, Google client secrets, `TOKEN_ENCRYPTION_KEY`, the Apple `.p8` key and OpenAI keys exist only in Vercel. The build refuses a Supabase *secret* key.

**Security notes.**
- The API accepts requests from the app's origin `capacitor://localhost` (CORS, no cookies).
- A request carrying an `Authorization` header is authenticated **only** by that token, never by cookies, so it can't be combined with a cookie for cross-site request forgery.
- Signing out or deleting the account erases the Keychain items, the encrypted local copy, exported temporary files and scheduled reminders.
- iOS keeps Keychain items after an app is deleted, so the first launch of a fresh install clears any left over from before.
- Capacitor's native-bridge logging is turned off (`loggingBehavior: 'none'`) because it would print Keychain values.

**Offline behavior.** The app always shows the last synced copy, encrypted on the device with AES-256-GCM and a key held in the Keychain. Edits made offline are saved on the iPhone and marked "not synced." When the connection returns, they are sent with the version they were based on. If the data changed on another device meanwhile, the app shows a conflict banner. You choose: **keep the newer saved version**, **replace it with this iPhone's edits**, or **save a copy** of the offline edits first. Nothing is overwritten silently. Syllabus parsing, the planner generator, ISBN lookup and Calendar sync need a connection.

## What has been tested, and what hasn't

Tested here, on this Mac:
- **Unit and integration tests** (`pnpm test`, 110 tests) covering:
  - bearer-token parsing and the origin rules
  - CORS for the app origin only
  - account deletion cascading through real Postgres
  - Google token revocation on deletion
  - Apple client-secret signing and token revocation, with a mocked Apple endpoint
  - the universal-link file and fallback link
  - reminder planning in campus time with daylight saving and the 64-notification limit
  - encryption of the local copy
  - the offline queue and conflict state machine
- **Native iOS Simulator build** (Xcode 27, iPhone 17 simulator, Swift Package Manager): `xcodebuild` builds the app, all 10 plugins and the Sign in with Apple plugin.
- **In-simulator test run** of the real app, against a mock Supabase Auth server and a local Postgres:
  - sign-up with the session stored in the Keychain
  - onboarding with university search through the bearer API
  - safe-area layout
  - PDF.js loading from the bundle
  - the Sign in with Apple plugin being registered
  - session restore after a full relaunch
  - the encrypted file on disk containing no readable text
  - offline cold start from the encrypted copy
  - an offline edit queued and not sent
  - a server-side change producing an explicit conflict, then resolved
  - sign-out deleting the local file
- **Website regression**: the browser test suite and web account deletion, against the same mock services.

Not tested yet. These need your accounts or devices:
- 🍎 signing, TestFlight and App Store submission
- 📱 any run on a physical iPhone
- live Sign in with Apple, which can't complete in the simulator without your Team and Apple ID
- live Google sign-in
- universal links, which need your deployed domain plus the Associated Domains entitlement
- local notification delivery, which needs a permission tap
- live Supabase email links into the app
- the iOS share sheet UI, and keyboard behavior on a device

## 1. Prerequisites

1. **The website must be deployed first** (DEPLOY_TO_VERCEL.md, steps 7–12). The app needs its HTTPS origin, for example `https://campusos-you.vercel.app`.
2. 🍎 **Apple Developer Program membership** is required for TestFlight, the App Store, Sign in with Apple and universal links. It's a paid annual membership; enroll at https://developer.apple.com/programs/ only if you decide to publish. A free Apple ID can run apps on your own iPhone for short-term testing, but those builds can't use Sign in with Apple or Associated Domains.
3. Xcode 26 or newer (this Mac has Xcode 27), and Node and pnpm (already installed).

## 2. Choose the bundle ID

The bundle ID is `com.lingeshsashikumar.campusos`, set in `capacitor.config.ts` and in Xcode. It must be unique across the App Store and can't change after your first upload. To use a different one, change it in **both** `capacitor.config.ts` and Xcode (target **App** → General → Bundle Identifier), and set the same value in Vercel's `IOS_BUNDLE_ID`.

## 3. Server settings in Vercel (Production)

Add these in Vercel → Project → Settings → Environment Variables, then redeploy:

| Variable | Value | Notes |
| --- | --- | --- |
| `IOS_BUNDLE_ID` | `com.lingeshsashikumar.campusos` | public identifier |
| `APPLE_TEAM_ID` | your 10-character Team ID (🍎 developer.apple.com → Account → Membership details) | public identifier. Enables `/.well-known/apple-app-site-association` |
| `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY` | 🍎 Certificates, Identifiers & Profiles → **Keys** → create a key with **Sign in with Apple** enabled for your App ID. Download the `.p8` once, and paste its full contents including the BEGIN/END lines | **Secret, server-only.** Used only to revoke Sign in with Apple tokens when an account is deleted (Apple requires this). Without it, deletion still works and tells Apple users how to remove access in iOS Settings |
| `SUPPORT_EMAIL` | your support address | shown on `/privacy` |

Check the association file: open `https://YOUR-DOMAIN/.well-known/apple-app-site-association`. It should list `TEAMID.com.lingeshsashikumar.campusos` and the `/auth/mobile-callback` path.

## 4. Supabase settings

In Supabase → Authentication:

1. **URL Configuration → Redirect URLs**, add:
   - `https://YOUR-DOMAIN/auth/mobile-callback`, where email confirmation and reset links for the app land
   - `campusos://auth/callback`, used only if you enable Google sign-in in the app
2. **Sign In / Providers → Apple** (if you enable Sign in with Apple): turn it on. Under **Client IDs**, enter your bundle ID `com.lingeshsashikumar.campusos`. Native sign-in needs no secret key or Services ID in Supabase.
3. Custom SMTP: Supabase's built-in email sender only delivers to your own team's addresses (2 per hour). Before other students can sign up, configure custom SMTP under Authentication settings.

## 5. Build-time app settings

```bash
cp mobile/.env.example mobile/.env.production.local
```

Edit `mobile/.env.production.local` (git-ignored). Every value here is public:

```
VITE_API_ORIGIN=https://YOUR-DOMAIN
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_ENABLE_APPLE_SIGNIN=true
VITE_ENABLE_GOOGLE_SIGNIN=false
```

App Store guideline 4.8: if you set `VITE_ENABLE_GOOGLE_SIGNIN=true`, Sign in with Apple must also be on. The build stops otherwise.

## 6. Build and open in Xcode

```bash
pnpm ios:sync    # builds mobile/dist and copies it into ios/App
pnpm ios:open    # opens the Xcode project
```

Run `pnpm ios:sync` again after every change to the web code or `mobile/.env.production.local`.

## 7. 🍎 Xcode signing and capabilities

In Xcode, select the **App** project → target **App** → **Signing & Capabilities**:

1. Tick **Automatically manage signing** and choose your **Team**.
2. **Sign in with Apple** is already listed (from `App/App.entitlements`).
3. Click **+ Capability** → **Associated Domains** → add `applinks:YOUR-DOMAIN` (no `https://`, no path). This is what makes confirmation and reset emails open the app.
4. **General** → set **Version** (e.g. `1.0`) and **Build** (`1`). Raise Build for every upload.

The app is set to **iPhone only** (`TARGETED_DEVICE_FAMILY = 1`). To support iPad later, change **Supported Destinations** and provide iPad screenshots.

## 8. 📱 Test on your iPhone

1. Connect the iPhone with a cable, unlock it, and trust the computer.
2. On the iPhone: Settings → Privacy & Security → **Developer Mode** → on (restart when asked).
3. In Xcode, pick your iPhone in the device menu and press **Run** (⌘R).
4. Checklist:
   - Create an account, open the confirmation email **on the iPhone**, and check that it opens CampusOS signed in.
   - Sign in with Apple, then sign out and back in.
   - Add a class, quit the app from the app switcher, and reopen. You should still be signed in, with the class shown.
   - Turn on Airplane Mode: you see the offline banner and your schedule and flashcards. Delete something, turn Airplane Mode off, and tap **Try again**. The change syncs.
   - Conflict check: edit offline on the iPhone, change something on the website, reconnect, and choose an option in the conflict banner.
   - Settings → **On this iPhone** → turn on reminders and allow notifications. Start a 1-minute focus timer, lock the phone, and wait for the notification.
   - Upload a syllabus PDF from Files. Export data and the `.ics` file through the share sheet.
   - Forgot password: open the email on the iPhone, and check that the app shows "Choose a new password."
   - Settings → Account → **Delete account**. Apple users confirm with Apple once more. You should return to sign-in with local data erased.

## 9. 🍎 TestFlight

1. In App Store Connect (https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**: platform iOS, name **CampusOS** (or another available name), your bundle ID, and any SKU.
2. In Xcode, choose **Any iOS Device (arm64)**, then **Product → Archive**.
3. In the Organizer window: **Distribute App** → **App Store Connect** → **Upload**.
4. When processing finishes, answer the **export compliance** question. CampusOS uses only standard encryption: HTTPS, plus iOS and WebKit cryptography for the local copy. Confirm the answer that applies with Apple's guidance.
5. **TestFlight** tab: add yourself as an internal tester and install with the TestFlight app on your iPhone.

## 10. 🍎 App Store submission

In App Store Connect:

- **Privacy Policy URL:** `https://YOUR-DOMAIN/privacy`. Review that page first; it's a factual draft describing the code, not legal advice.
- **App Privacy (nutrition label)**, matching `ios/App/App/PrivacyInfo.xcprivacy`:
  - data linked to the user, for app functionality only, never used for tracking: Contact Info → Email Address, Name; User Content → Other User Content (classes, grades and so on); Identifiers → User ID
  - no tracking
- **Screenshots:** 6.9-inch iPhone screenshots are required, for example from the iPhone 18 Pro Max simulator.
- **Review notes:**
  - Provide a demo account (email and password) with sample classes.
  - Explain that Google Calendar is connected through the website and optional.
  - Explain that AI parsing is optional.
  - Mention that account deletion is in Settings → Account.
- Points reviewers look for:
  - Guideline 4.2 (more than a website): offline access, on-device reminders, native sharing, Keychain sign-in, Sign in with Apple.
  - 4.8: Sign in with Apple is offered whenever Google sign-in is.
  - 5.1.1(v): in-app account deletion.

Submit for review. If it's rejected, the message names the guideline. Reply in Resolution Center or fix and resubmit with a higher Build number.

## Updating the app later

- Web or UI changes: `pnpm ios:sync`, then raise **Build** in Xcode, archive, and upload.
- Server-only changes deploy through Vercel. The app picks them up without an App Store update, as long as the API stays compatible.
- Native plugin changes: `pnpm install`, then `pnpm ios:sync`, then build.
