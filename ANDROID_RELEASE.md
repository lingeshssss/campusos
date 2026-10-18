# CampusOS for Android: build, test and publish on Google Play

The Android app is the **same bundled React client as the iPhone app** (Vite + Capacitor 8), with an Android shell in `android/`. It never loads the website remotely: it calls the CampusOS API on Vercel with a Supabase access token, exactly like the iPhone app. Secrets (database URL, Google client secret, token-encryption key, OpenAI key) stay in Vercel and are never in the app.

Steps marked 🧑 need you (an account, a password or a device). Nothing here costs money except the one-time Google Play developer registration fee, which you pay only if you decide to publish.

| | |
| --- | --- |
| App name | CampusOS |
| applicationId / package | `com.lingeshsashikumar.campusos` (same as the iOS bundle ID in `capacitor.config.ts`). **It can never change after the first Play upload.** Confirm it before uploading. |
| Versions | `android/gradle.properties`: `campusosVersionCode` (must increase on every upload) and `campusosVersionName` |
| SDKs | minSdk 24 (Android 7.0), compile/target SDK 36 (Android 16, required by Google Play for new apps and updates) |
| Toolchain | Android Gradle Plugin 8.13, Gradle 8.14.3, **JDK 21** (newer JDKs such as 25 don't work with this Gradle) |
| Native code | none (no `.so` files), so the 16 KB page-size requirement doesn't apply |

---

## 1. Install the tools 🧑

1. Install **Android Studio** from https://developer.android.com/studio and open it once. Its setup wizard installs the Android SDK. In **Settings → Languages & Frameworks → Android SDK**, make sure **Android 16 (API 36)** and the latest **Build-Tools** are installed.
2. Android Studio includes a JDK 21 ("JetBrains Runtime"). For terminal builds, point at it:
   ```bash
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   ```
   (Add both lines to `~/.zshrc` to keep them.) On this Mac, a Temurin JDK 21 and the SDK command-line tools are also installed in `~/Library/Java` and `~/Library/Android/sdk`.
3. Node and pnpm as for the website (`pnpm install --frozen-lockfile`).

## 2. Configure the build

`mobile/.env.production.local` (git-ignored, public values only; template in `mobile/.env.example`) is shared by the iPhone and Android apps:

```
VITE_API_ORIGIN=https://www.campusos.dev
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_ENABLE_APPLE_SIGNIN=false
VITE_ENABLE_GOOGLE_SIGNIN=false
VITE_ENABLE_GOOGLE_SIGNIN_ANDROID=false
```

Production builds refuse `http://`, `localhost` and secret Supabase keys.

## 3. Build and run

```bash
pnpm android:sync     # builds the web bundle (mobile/dist) and copies it into android/
pnpm android:open     # opens the project in Android Studio
pnpm android:debug    # sync + debug APK
pnpm android:bundle   # sync + release App Bundle (signed only if the upload key is configured, step 5)
```

| Artifact | Path |
| --- | --- |
| Debug APK (local testing only) | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Release App Bundle (Google Play) | `android/app/build/outputs/bundle/release/app-release.aab` |

**Emulator:** Android Studio → **Device Manager** → **Create device** (for example a Pixel with an Android 16 *Google Play* image, which includes Chrome for Google sign-in) → ▶. Then press **Run** in Android Studio, or install the APK: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

**Physical phone** 🧑: on the phone, Settings → About phone → tap **Build number** 7 times → Developer options → **USB debugging** on. Connect by USB, accept the prompt, then **Run** in Android Studio (or `adb install …`).

Debug builds allow Chrome DevTools at `chrome://inspect`. Release builds do not.

## 4. One-time backend and Supabase settings 🧑

1. **Supabase → Authentication → URL Configuration → Redirect URLs**: make sure both are listed (the iPhone app uses the same ones):
   - `campusos://auth/callback`: Google sign-in returns here from the system browser
   - `https://www.campusos.dev/auth/mobile-callback`: email confirmation and password-reset links
2. **Vercel → Environment Variables (Production)**, then redeploy:
   - `SUPPORT_EMAIL`: an inbox you read. It's shown on `/privacy` and on `/delete-account` for people who can't sign in to delete their account (Google Play requires that path). Play also needs a contact email.
   - `ANDROID_PACKAGE_NAME` = `com.lingeshsashikumar.campusos`
   - `ANDROID_SHA256_CERT_FINGERPRINTS`: see step 9. Until it's set, `/.well-known/assetlinks.json` returns 404. Email links still work: they open the CampusOS web page, whose **Open in the CampusOS app** button returns to the app.
3. **Google sign-in (optional).** It is currently **off**, because Google is not enabled as a provider in your Supabase project (tested: Supabase answers "provider is not enabled"). To turn it on: Supabase → Authentication → Sign In / Providers → **Google** → enable, with a **Web application** OAuth client (see DEPLOY_TO_VERCEL.md step 6). Then set `VITE_ENABLE_GOOGLE_SIGNIN_ANDROID=true` and rebuild.
   - How it works: the app opens Google in the **system browser** (a Chrome Custom Tab, never an embedded WebView), using PKCE. Supabase returns to `campusos://auth/callback`, and the app exchanges the one-time code.
   - **No Android OAuth client and no SHA-1/SHA-256 fingerprint is needed for Google sign-in** with this design: only the Web client configured in Supabase. Fingerprints matter only for App Links (step 9).
4. **Google Calendar** stays separate from sign-in. The app opens the website to connect it, and the token exchange and refresh token stay on the server. No Google secret is in the app.

## 5. Create the upload key (once) 🧑

Google Play uses **two keys**:
- **Upload key**: yours. You sign each `.aab` with it before uploading. If you lose it, you can ask Google Play support to reset it.
- **App signing key**: created and kept by Google (**Play App Signing**). Google re-signs what users install with this key. You never hold it.

Create the upload key **outside the repository**. `keytool` asks for passwords without showing them:

```bash
mkdir -p ~/campusos-keys && chmod 700 ~/campusos-keys
"$JAVA_HOME/bin/keytool" -genkeypair -v \
  -keystore ~/campusos-keys/campusos-upload.jks \
  -alias campusos-upload -keyalg RSA -keysize 4096 -validity 10000
```

Then create `android/keystore.properties` (git-ignored; never commit it):

```properties
storeFile=/Users/YOUR-USER/campusos-keys/campusos-upload.jks
storePassword=the store password you chose
keyAlias=campusos-upload
keyPassword=the key password you chose
```

```bash
chmod 600 android/keystore.properties
```

**Back up** the `.jks` file and both passwords in a password manager, plus one offline encrypted copy (for example an encrypted USB drive). Don't email it or put it in a shared drive. For CI, use the environment variables `CAMPUSOS_UPLOAD_STORE_FILE`, `CAMPUSOS_UPLOAD_STORE_PASSWORD`, `CAMPUSOS_UPLOAD_KEY_ALIAS` and `CAMPUSOS_UPLOAD_KEY_PASSWORD` instead of the file.

## 6. Build the signed release

```bash
pnpm android:bundle
"$JAVA_HOME/bin/jarsigner" -verify android/app/build/outputs/bundle/release/app-release.aab   # must say "jar verified."
```

Without `keystore.properties`, the build prints **"The release bundle will be UNSIGNED"**. That file cannot be uploaded.

## 7. Google Play Console 🧑

1. **Developer account**: https://play.google.com/console/signup. Choose a **personal** or **organization** account, pay the one-time registration fee, and complete **identity verification** (and device verification on an Android phone, if asked). Google sets these requirements; review times vary.
2. **Create app**: name *CampusOS*, default language, **App**, **Free**; accept the declarations.
3. **Play App Signing**: on the first upload, keep **"Use Google-generated key"** (recommended).
4. **Store listing** (Grow → Store presence → Main store listing):
   - App name, short description and full description: drafts in section 11.
   - App icon 512×512: `android/play-store/icon-512.png`
   - Feature graphic 1024×500: `android/play-store/feature-graphic-1024x500.png`
   - Phone screenshots (at least 2, from the real app): sign in with the demo account (step 8), then take them with the phone's screenshot button or `adb exec-out screencap -p > screen.png`. Good candidates: Today, My schedule, Deadlines, Grades, Study.
   - Contact email (your `SUPPORT_EMAIL`) and privacy policy URL `https://www.campusos.dev/privacy`
5. **App content** (Policy → App content):
   - **Privacy policy**: `https://www.campusos.dev/privacy`
   - **App access**: "All or some functionality is restricted", then add the demo account (step 8) with instructions: *"Sign in with the email and password below. Data in this account is sample data."*
   - **Ads**: No.
   - **Content rating**: complete the IARC questionnaire (category *Utility, Productivity, Communication, or Other*). CampusOS has no user-to-user communication, no location sharing and no purchases.
   - **Target audience**: CampusOS is built for college students. Choosing **18 and over** keeps it outside the Families policy. If you include under-18 ages, Families requirements apply.
   - **Data safety**: use the worksheet in section 10.
   - **Account deletion**: in-app path *Settings → Account → Delete my account*. Web link: `https://www.campusos.dev/delete-account`.
   - **Government apps / Financial features / Health**: CampusOS is none of these. Answer accordingly.
6. **Testing tracks**:
   - **Internal testing** (up to 100 testers, available within minutes): upload `app-release.aab`, add tester emails, then install with the opt-in link. **Test the Play-installed build** (step 9 explains why).
   - **Closed testing**: personal developer accounts created after 13 November 2023 must run a closed test with **at least 12 testers opted in continuously for at least 14 days** before applying for production access (Dashboard → **Apply for production**). Google usually reviews applications within about 7 days, but it can take longer. Organization accounts don't have this requirement.
7. **Production**: create a release, upload the `.aab`, add release notes, choose countries, and use **managed publishing** if you want to control when an approved release goes live. Review times are not guaranteed.

## 8. Demo account for reviewers 🧑

Create a dedicated account (for example `campusos.review+play@your-domain`) on the website, confirm its email, and fill it with **sample** data only: a fictional name, a few classes, deadlines, a graded course and some flashcards. Never use a real student's data. Put its email and password only in Play Console **App access**. Keep it signed up with email and password (not Google), so reviewers don't need a Google account.

## 9. Signing fingerprints for App Links 🧑

Email confirmation and password-reset links open the app directly once Android verifies `https://www.campusos.dev/.well-known/assetlinks.json`. That file must list the **SHA-256 fingerprint of every certificate whose builds should open the links**:

| Certificate | Where to find its SHA-256 | List it? |
| --- | --- | --- |
| **Play app signing key** (what Play-installed copies are signed with) | Play Console → Test and release → **App integrity** → App signing | **Required** |
| Upload key | Same page, or `keytool -list -v -keystore ~/campusos-keys/campusos-upload.jks` | Optional (for sideloaded release builds) |
| Debug key (`~/.android/debug.keystore`) | `keytool -list -v -keystore ~/.android/debug.keystore -storepass android` | Development only. Don't leave it in production. |

Set `ANDROID_SHA256_CERT_FINGERPRINTS` in Vercel to the comma-separated values (format `AB:CD:…`, 32 pairs), then redeploy. Check:

```bash
curl https://www.campusos.dev/.well-known/assetlinks.json
adb shell pm verify-app-links --re-verify com.lingeshsashikumar.campusos
adb shell pm get-app-links com.lingeshsashikumar.campusos      # www.campusos.dev should show "verified"
```

**Why test the Play-installed build:** Google re-signs your upload with the app signing key, so its fingerprint differs from local builds. App Links verified for your local key do not prove they work for users. Install from the internal-testing link and tap a real password-reset email. Google sign-in does not depend on fingerprints (step 4).

## 10. Data Safety worksheet (facts from the code; review before submitting)

**Does the app collect or share user data?** Yes, it collects data. It does **not share** it: Vercel, Supabase and (only if AI parsing is enabled) OpenAI process data **on CampusOS's behalf**, which Play classes as service providers, not sharing. No advertising, analytics or crash-reporting SDKs are included. The app's third-party code is Capacitor and its official plugins, the secure-storage plugin, supabase-js, React and PDF.js, and none of them send analytics.

**Encrypted in transit:** Yes (HTTPS only; cleartext traffic is disabled in the app). **Users can request deletion:** Yes (in-app and `/delete-account`).

| Play data type | Collected | Required? | Purpose | Notes |
| --- | --- | --- | --- | --- |
| Personal info → **Email address** | Yes | Required | Account management, App functionality | Supabase Auth account |
| Personal info → **Name** | Yes | Required (profile name in onboarding) | App functionality | Also from Google sign-in, if used |
| Personal info → **User IDs** | Yes | Required | Account management | Supabase account ID |
| Personal info → **Other info** | Yes | Required | App functionality | University, majors and minors, graduation year, semester dates |
| App activity → **Other user-generated content** | Yes | Required to use the features | App functionality | Classes, deadlines (with syllabus excerpts), grades, textbooks and prices, plans, study blocks, timer sessions, flashcards, appearance settings |
| Calendar → **Calendar events** | Yes, only if the student connects Google Calendar | Optional | App functionality | Events in the CampusOS-created Google calendar |
| Files and docs | **No** | n/a | n/a | PDFs are read on the phone; only extracted text is sent, and only when the student asks to parse it |
| Location, contacts, photos, health, financial, messages, audio, device IDs | **No** | | | The campus timezone is typed in, not detected |

Also decide on server request logs: Vercel and Supabase keep standard request logs (which include IP addresses) for operating the service. They aren't used for tracking or advertising.

**Retention and deletion:** data is kept while the account exists. Account deletion immediately deletes the account and all CampusOS rows (database cascade), revokes Google Calendar access, and erases the phone's encrypted copy and scheduled reminders. Android backup is disabled for the app, so nothing is restored to a new phone.

**AI parsing:** OpenAI receives syllabus text only if `OPENAI_API_KEY` is set on the server. It isn't set now; if you enable it, say so in the Data safety form (service provider) and keep the privacy page accurate.

## 11. Draft store listing (verified features only)

**Short description (80 characters max):**
> Your classes, deadlines, grades and study time in one calm place.

**Full description:**
> CampusOS is a personal planner for college students.
>
> • Set up in minutes: pick your school from 2,349 U.S. universities, then add your majors, semester dates and classes.
> • See your day: today's classes with "leave by" times based on your own travel estimates.
> • Stay ahead of deadlines: add them by hand or pull dates from a syllabus PDF, then review every item before it's saved. Optional reminders 1 week and 1 day before exams and papers.
> • Grades and GPA: weighted categories, "what do I need on the final", and a GPA calculator using your school's confirmed scale.
> • Plan next semester: compare section combinations, check prerequisites and time conflicts.
> • Study tools: study blocks, a focus timer and spaced-repetition flashcards.
> • Textbooks: look up books by ISBN, start with legal free resources, and compare prices you collect.
> • Works offline: your schedule, deadlines and flashcards stay readable without a connection.
> • Light, dark or system appearance, with your school's official colors for supported universities.
> • Your data is yours: export it any time, or delete your account in the app.
>
> No ads. No tracking. Requires a free CampusOS account.

Add a Google Calendar sync line only after you've confirmed Calendar works in production.

## 12. Updates

1. Increase `campusosVersionCode` in `android/gradle.properties` (2, 3, …; Play rejects a code it has already seen) and update `campusosVersionName` (for example 1.0.1).
2. `pnpm android:bundle`, verify the signature, and upload it to the testing track first, then promote to production.
3. Backend changes deploy separately (Vercel, from `main`). Keep the API backward compatible: installed apps update slowly.

## 13. How Android features behave

- **Session**: stored encrypted with a key in the **Android Keystore** (secure-storage plugin), refreshed while the app is open. An expired session sends the student to sign in and keeps unsynced edits for the same account. **Sign out** and **account deletion** erase the session, the encrypted offline copy, pending reminders and the school colors.
- **Offline**: an encrypted copy (AES-GCM, key in the Keystore) of the last synced data. Edits made offline are queued and synced with version checks. If the data changed elsewhere, the app shows a conflict choice and never overwrites silently.
- **Reminders** (off until turned on in Settings → On this phone, which is when Android 13+ asks for permission): two channels, *Deadline reminders* and *Focus timer*. CampusOS **does not use exact alarms** (that permission is removed), so Android may deliver late to save battery. Measured on Android 16: a delivery window of about 75% of the remaining time, capped at **1 hour**. Deadline reminders can be up to about an hour late. A timer alert can be late by up to three-quarters of the time that was left. The timer itself is timestamp-based and always correct when reopened. Reminders are rebuilt whenever the app opens.
  - **After a reboot**: pending reminders are restored at boot (verified on the emulator).
  - **After a force-stop** (Settings → Force stop): Android cancels all of the app's alarms. They come back the next time CampusOS is opened.
  - **Timezone changes**: reminder times are fixed instants in the campus timezone, so they don't shift.
- **Files**: syllabus PDFs and import files use Android's system file picker. The app has no storage, photo or camera permissions. Exports open the system share sheet.
- **Back gesture**: closes dialogs and steps back, returns to Today, and at the top screen moves CampusOS to the background.
- **Appearance**: Light, Dark or System, plus school colors, the same as the website. The status and navigation bar icons and the window background follow the theme.

## 14. Test status

Verified on an **Android 16 emulator** (Pixel 7 profile, WebView 133), not on a physical phone:
- Debug and release builds install and launch. The release build isn't debuggable and exposes no WebView DevTools.
- Sign-in screens in light and dark. Dark mode switches live, and a cold start is dark from the first frame.
- Keyboard resizing; back from Sign up to Sign in, then to the background.
- A live request to your Supabase project (wrong password gives the correct message).
- "Continue with Google" opens a Chrome Custom Tab, and the callback link returns to the app.
- Notification permission denied and granted, both channels, the icon, delivery in the background, inexact windows, and restore after reboot.

**Not tested yet. These need an account, a phone or Play:**
- Signing in to a real account, onboarding, saving a class and reopening, sync and conflicts
- The PDF picker and share sheet, import/export, flashcards and the offline view
- Deleting an account with password reauthentication
- Password-reset and confirmation emails opening the app
- Google sign-in (disabled in Supabase)
- A physical phone
- A Play-installed build

Before submitting, run through those on the internal-testing build.
