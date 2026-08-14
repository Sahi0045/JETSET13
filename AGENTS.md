# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## CURRENT WORK IN PROGRESS (read this first)

Focus is **Android only**. Do not start or continue iOS work. The mobile repo is a
sibling directory outside this workspace — edit it with `execute_bash` and an explicit
`cd`, workspace file tools cannot reach it:

```
/media/shubham/OS/for linux work/jetsetter android/jetsetter-mobile
```

### 1. Google Play release (in progress)

- Package `com.jetsetterss.mobile`, Expo SDK 54, EAS production profile builds an **`.aab`** (Play requires it).
- Build #1 (versionCode ~2) is already uploaded to **Internal testing**. Keep it there. Do **not** delete it and do **not** promote it to Production.
- `eas.json` was switched from `appVersionSource: "local"` to `"remote"` because `autoIncrement` with `app.config.js` requires remote versioning. Confirm that is committed before building.
- Always reuse the existing EAS keystore. Never generate a new one.
- Next build (needed, because build #1 still ships the old permission set):
  ```bash
  cd "/media/shubham/OS/for linux work/jetsetter android/jetsetter-mobile"
  eas build --platform android --profile production
  ```
- Every AAB upload needs a new versionCode. Upload to Testing → Internal testing, verify on device, only then promote to Production.
- First upload was manual. `eas submit` needs a Play service-account JSON — never commit that file.

### 2. Play Console questionnaires (in progress)

Answers already given, keep them consistent:

- Online content **Yes** (flight/hotel/cruise/package inventory is fetched at runtime).
- Violence **No**, controlled substances **No**, age-restricted products **No**, precise location shared with other users **No**, digital goods **No** (real-world travel services), cash/gift-card/crypto/NFT rewards **No**, browser or search engine **No**, primarily news/education **No**.
- Data safety — collected, **not shared**, not ephemeral:
  - Name, Email, Phone, User IDs → required, app functionality / account management
  - Address → optional, app functionality
  - Other info (nationality, gender, DOB, passport, PAN) → optional, app functionality
  - Purchase history → required, app functionality
  - User payment info → required, app functionality (card/CVV go to hosted ARC Pay and are not stored by the app; transaction records are stored)
  - Photos → optional, app functionality
  - App interactions → optional, analytics
  - Device or other IDs → optional, app functionality (FCM token stored in `user_devices` by `backend/services/push-notification.service.js`)
  - Web browsing history → **not collected**
- Privacy policy: `https://jetsetterss.com/privacy-policy`
- Account deletion: `https://jetsetterss.com/profile/privacy`
- GDPR deletion anonymises immediately and hard-deletes after ~30 days. Do not claim instant erasure of all history.

### 3. Google Sign-In on the Play build (verify)

Play App Signing re-signs the AAB, so the Play-installed app has a different certificate than preview APKs. Play app-signing SHA-1:

```
AA:C3:10:5B:06:A1:A8:27:22:E5:C6:1D:2C:7D:E2:40:3F:1A:84:BF
```

Added to Firebase by the user. No rebuild is needed for a fingerprint change — force-close the Play-installed app and retry after propagation. Keep the EAS/preview keystore SHA-1 registered too, for directly installed APKs. If it still fails, confirm the Firebase project matches the Google web client ID project and refresh `google-services.json`. Do not fake or patch around Google login.

### 4. Android permission cleanup (built into next AAB only)

`expo-location` removed from `package.json`; `android.blockedPermissions` added in `app.config.js` for `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `CAMERA`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `BLUETOOTH_CONNECT`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`. Source uses none of those APIs, so do not declare location/audio collection in Data safety just because the old manifest listed the permissions.

### 5. Security work (done, applied in production)

- Supabase RLS enabled on every public base table; legacy user-ID reconciliation applied first (mismatches = 0). `user_preferences.user_id` is `text`, so policies use `auth.uid()::text`. A follow-up migration dropped pre-existing permissive policies on `users`, callback/lead tables, payment links, and agents. Public read on `flight_deals` is intentional.
  - `supabase/migrations/20260624140000_reconcile_legacy_user_ids.sql`
  - `supabase/migrations/20260728120000_enable_rls_all_public_tables.sql`
  - `supabase/migrations/20260728130000_drop_permissive_rls_policies.sql`
  - Backend uses the service-role key and bypasses RLS, so it is unaffected.
- Mobile app no longer contains ARC Pay or Amadeus credentials; `arcPayService` only calls the backend (`gateway-status`, `hosted-checkout`).
  **Still outstanding: rotate the ARC Pay and Amadeus credentials with the providers.** They were previously committed and shipped in an APK; a private repo does not undo that.
- GDPR routes now exist in production (`backend/routes/gdpr.routes.js`, mounted in `server.js`, `backend/server.js`, `backend/api/index.js`), all behind `protect`. Unauthenticated calls return 401, not 404.

### 6. Known open issues

- **Amadeus DNS outage (external).** `test.api.amadeus.com` and `api.amadeus.com` have no DNS records from public resolvers or Amadeus authoritative DNS. Flight search fails with `getaddrinfo ENOTFOUND`. **Do not enable mock flights** and do not claim flight search is fixed — this needs Amadeus support.
- Some older flight bookings have `user_id = null`, so they are missing from My Trips. The booking-save flow still needs to attach the logged-in user ID.
- Car rental is **not** implemented in `amadeusService.js`; the Amadeus questionnaire text describes an intended integration.

### 7. Working agreements

- Brand palette: primary teal `#055B75`, dark teal `#034457`, accent `#0890BC`, sky `#65B3CF`, light bg `#F1FBFD`. Android icon background is navy `#182647` because the logo has an opaque navy plate. Never introduce generic blue/indigo (`#0066FF`, `#1e40af`, `#1976D2`, `#0EA5E9`).
- Expo Go: `npx expo start -c --go`.
- No scratch `.txt`/`.md` files for working notes; fix the issue in place.
- Verify before claiming something is fixed. Proper fixes over patches.
- Push to `main` only when explicitly asked.
- Shared backend + Supabase DB between web and mobile is intentional.
- Stitch MCP before UI redesigns: create a temporary `scripts/stitch-driver.mjs` (project ID `5019874695705983420`, GCP project `jets-1b5fa`) and delete it afterwards.

## Project overview

JETSET13 (Jetsetters) is a travel booking platform with React (Vite) frontend and Node.js/Express backend. Surfaces include flights, hotels, cruises, vacation packages, visas, and an admin/quote/inquiry workflow. ES modules (`"type": "module"`) throughout.

## Common commands

```bash
# Dev (preferred): spawns backend on :5004 + Vite on :5173, Vite proxies /api to :5004
npm run dev

# Pieces, if needed individually
npm run server         # nodemon server.js on :5004
npm run client         # vite dev server on :5173

# Build & run prod
npm run build          # vite build → dist/, then scripts/copy-public-assets.js
npm start              # NODE_ENV=production node server.js

# Tests (Vitest with three projects)
npm test                                          # all projects
npm run test:frontend                             # jsdom project (React)
npm run test:backend                              # node project (controllers/services)
npm run test:integration                          # serial, supertest-driven API tests
npm run test:watch                                # all projects, watch mode
npx vitest run tests/path/to/file.test.js         # single file
npx vitest run -t "expected behavior name"        # filter by test name

# Standalone integration scripts (hit real APIs, not Vitest)
npm run test:hotel-api / test:direct-amadeus / test:supabase / test:chatbot ...
```

There is no lint or typecheck script; this is a JS project with `jsconfig.json` only.

## Architecture

### Three entry points for the same Express app
This is the most important thing to understand before editing routes:

1. **`server.js` (repo root)** — production monolith server (`npm start`). Mounts routes under `/api/*`, serves the built SPA from `dist/`, and includes a direct `/api/send-email` endpoint that exists *only* here (not in the other entries). Has its own port-finding fallback if the requested port is busy.
2. **`backend/server.js`** — the dev backend (launched by `scripts/start-dev.js` via nodemon). More middleware (audit logging, redaction, jobs like `workflowEngine`, `dataRetention`, `checkQuoteExpiration`). Mounts roughly the same routes plus `featureFlag`, `airport`, `analytics`.
3. **`backend/api/index.js`** — the Vercel serverless handler, re-exported by `api/index.js`. Mounts each route **twice**, once at `/api/*` and once at `/*`, because Vercel rewrites `/api/(.*)` to this function (see `vercel.json`). All routes are consolidated here to stay under Vercel's 12-function limit.

When adding a route, register it in all three places it belongs. The route file itself lives in `backend/routes/`.

### Frontend
- Entry: `index.html` → `frontend/main.jsx` → `frontend/src/app.jsx`. App is wrapped in `BrowserRouter`, `HelmetProvider`, `SupabaseAuthProvider`, and `LocationProvider`.
- Pages: `frontend/src/Pages/` — `Common/` for booking flows (`cruise`, `flights`, `hotels`, `packages`, `visa`, `rentals`), `Admin/` for the admin panel, `Profile/`, `Request/`.
- Path aliases (configured in `vite.config.js` only — Vitest replicates `@` separately): `@` → `frontend/src`, `@pages`, `@components`, `@src` → `frontend`.
- Build chunking: `vite.config.js` defines explicit `manualChunks` — `react-vendor`, `ui-icons`, `date-utils`, `pdf-utils`, `bootstrap`, `admin`, `booking`, `vendor-misc`. Keep this in mind when adding heavy dependencies; route them into the right bundle rather than `vendor-misc`.
- Routes are lazy-loaded with `React.lazy(...).catch(() => Fallback)` so an import failure renders a loading-state shim instead of crashing. Mirror this pattern for new top-level routes.

### Backend layering
Standard Express layering inside `backend/`:
- `routes/*.routes.js` — Express routers, one per resource
- `controllers/` — request handlers
- `services/` — business logic + integrations (`amadeusService`, `gemini.service`, `emailService`, `cache.service` (ioredis), `sms.service` (twilio), `cdn.service`, `templateResponse.service`, etc.)
- `models/` — Supabase-backed data models
- `middleware/` — `auth.middleware.js` (Supabase JWT), `auditLog.middleware.js`
- `jobs/` — background jobs started from `backend/server.js` (`workflowEngine`, `dataRetention.job`, `checkQuoteExpiration`)
- `config/supabase.js` — single Supabase client; `config/chatbot.js` for Gemini setup

### External services
Primary: **Supabase** (auth + Postgres data). Legacy/secondary: **Firebase** (older auth flows still referenced in some pages). **Amadeus** (flight/hotel inventory), **ARC Pay** (payments), **Resend** (email), **Twilio** (SMS), **Google Gemini / LangChain** (chatbot under `backend/api/chat/` and `backend/services/`). When debugging, check that the relevant env vars are set — `server.js` logs the presence of Amadeus keys on startup, but most other services fail silently if misconfigured.

### Vitest setup
`vitest.config.js` defines three projects (frontend/backend/integration) with separate `setupFiles`. Integration tests run with `sequence.concurrent: false` because they hit a real DB. Coverage uses v8 across both `backend/**` and `frontend/src/**`.

### Database
Supabase Postgres is the system of record. SQL schemas live in `scripts/db/*.sql` and `supabase/migrations/`. There is also a local `database/database.sqlite` used by some scripts. Migrations are not auto-applied — apply manually via Supabase or by running the scripts in `scripts/maintenance/`.

## Deployment

- **Vercel** (primary, see `vercel.json`): builds with `npm run build`, serves `dist/`, routes `/api/*` to the single function `api/index.js`. Anything that doesn't fit serverless constraints (long-running jobs, background workers) belongs in the `backend/server.js` path, not the Vercel handler.
- **Render** (`render.yaml`, `render-setup.js`) and **Docker** (`dockerfile`, `docker-compose.yml`, `Makefile`) are alternative deploy targets for the full `server.js` monolith.
- Vercel-specific guard: `server.js` checks `VERCEL_ENV` and skips the local `app.listen` path when running serverless. Don't add unconditional `listen()` calls at module load.

## Companion mobile app

A separate React Native (Expo SDK 54, RN 0.81, React 19) client lives in a **sibling directory, not in this repo**:

```
/media/shubham/OS/for linux work/jetsetter android/jetsetter-mobile/
```

It is its own git repository (`com.jetsetterss.mobile`, Expo project `ef6b16d3-6cf1-4174-9e38-73fda97b94a9`, owner `shubhamkush`). Key facts:

- Consumes the **same backend API** as the web app — `API_BASE_URL` is set in its `app.config.js` `extra` block (env-driven). When changing or removing a backend route here, the mobile app's `src/services/*` (`flightService`, `hotelService`, `cruiseService`, `CruiseApiService`, `bookingService`, `quoteService`, `requestService`, `arcPayService`, etc.) likely calls it too — search that repo before deleting endpoints.
- Auth: Supabase + Firebase + Google Sign-In via `@react-native-google-signin/google-signin`. State in Redux Toolkit (`src/store/slices/`).
- Build via EAS (`eas.json`): preview/production both produce Android APKs; signing keystore `@shubhamkush__jetsetterss-mobile.jks` lives in that repo.
- Dev: `npm start` (Expo), `npm run android`, `npm run ios`, `npm run web` (react-native-web).
- Several implementation guides at the directory root (`FLIGHT_IMPLEMENTATION_GUIDE.md`, `HOME_CRUISE_IMPLEMENTATION_GUIDE.md`, `REQUEST_IMPLEMENTATION_GUIDE.md`, `ANDROID_APP_SPECIFICATION.md`) document the contract between mobile and this backend.

Cross-repo work: backend changes that affect mobile (auth response shape, payment flows, cruise/flight/hotel/request payload shape) need to be mirrored or at least sanity-checked against that repo's services layer.

## Conventions

The `.cursor/rules/software-engineering-standards.mdc` rules apply (camelCase JS, PascalCase types, boolean prefixes `is/has/should/can`, no hardcoded secrets, parameterized DB queries, etc.). Notable project-specific items from that file: never reset/drop the database, use migrations for schema changes, and mocks belong only in test files.

## CURRENT WORK IN PROGRESS (handoff — read this first)

Active effort: publishing the Android app (`jetsetter-mobile`, package `com.jetsetterss.mobile`) to the Google Play Store. Status as of this handoff:

### Done
- **Web security**: Enabled RLS on every `public` table in Supabase (migrations `20260728120000_enable_rls_all_public_tables.sql`, `20260728130000_drop_permissive_rls_policies.sql`) and dropped 9 pre-existing `USING (true)` policies that had silently defeated RLS (`users` table with bcrypt passwords was fully anon-readable/writable before this). Ran `20260624140000_reconcile_legacy_user_ids.sql` to fix 1 mismatched `public.users.id != auth.uid()` row before applying RLS. Verified live with the anon key: sensitive tables return `[]`, anon `INSERT` into `users` returns `401`, public lead-capture forms (`subscriptions`, `hotels_callback`, etc.) still work (INSERT-only for anon).
- **`payment.routes.js`**: refactored the `?action=` switch to an `actionHandlers` lookup object (same behavior, no dead code, single `SUPPORTED_ACTIONS` source of truth).
- **GDPR routes bug**: `/api/gdpr/*` (data summary, export, **delete-account**, consent) were declared inline in `backend/server.js` only — 404 in production because Vercel serves `backend/api/index.js`. Also had no `protect` middleware even though handlers read `req.user.id`. Fixed: new `backend/routes/gdpr.routes.js` (with `protect`), mounted in all three entry points. Verified live: `404` → `401` on `jetsetterss.com`.
- **Mobile credentials**: removed hardcoded ARC Pay merchant id/username/password and Amadeus key/secret from `jetsetter-mobile` (`arcPayService.js` now calls the backend only: `?action=gateway-status`, `?action=hosted-checkout`). `.env` gitignored (still tracked in git, intentionally — untracking would break EAS builds that read `process.env.API_BASE_URL` etc. via `app.config.js`; repo is private so this is an accepted tradeoff for now).
- **App icons**: generated `icon.png` / `adaptive-icon.png` / `splash-icon.png` (1024×1024) / `playstore-icon-512.png` from `assets/jet.png`, de-rounding baked-in corners (filled with logo navy `#182647` instead of cropping, so the wordmark isn't clipped). `app.config.js` splash/adaptiveIcon `backgroundColor` set to `#182647` to match the logo's own navy backdrop (deliberately not brand teal `#055B75` — the logo art has an opaque navy background baked in).
- **`eas.json`**: `appVersionSource` changed `local` → `remote` (required for `autoIncrement: true` to work with `app.config.js`).
- **Permissions cleanup**: shipped AAB declared 16 permissions vs 3 in `app.config.js` (extras from transitive config plugins: `expo-location` installed-but-unused, `react-native-webview` → CAMERA/RECORD_AUDIO, etc.). Removed unused `expo-location` dep, added `android.blockedPermissions` for the rest. **This fix has NOT been rebuilt yet** — the AAB currently in Internal testing (versionCode 2) still has all 16 permissions and does not match the Data safety declaration below.
- **Play Console**: app created (App / Free), first release live on **Internal testing** track (versionCode 2, "Available to internal testers"). Privacy policy URL: `https://jetsetterss.com/privacy-policy`. Account deletion URL: `https://jetsetterss.com/profile/privacy`.
- **Data safety form**: in progress in Play Console, being filled in live during chat. Answers given so far (all reflect actual app behavior, not the stale 16-permission binary): Collected+not-shared for name/email/phone/address/user IDs/other-info(DOB,gender,nationality,passport,PAN)/payment info/purchase history/photos(optional)/app interactions(purpose=Analytics only)/device-or-other-IDs(optional, purposes=App functionality+Developer communications)/crash logs/diagnostics. Explicitly **NOT** collected: location (both precise/approximate), race/ethnicity, political/religious beliefs, sexual orientation, emails/SMS/other-messages content, web browsing history.
- **Google Sign-In on Play build**: was failing (`DEVELOPER_ERROR` / "keystore SHA-1 not registered") because Play App Signing re-signs the AAB with Google's own key, which wasn't registered in Firebase. Extracted the real cert via `adb pull` + `apksigner verify --print-certs` (Play Console UI for this has moved/is inconsistent in the 2026 layout — couldn't find "App signing" via any sidebar path). SHA-1 found: `AA:C3:10:5B:06:A1:A8:27:22:E5:C6:1D:2C:7D:E2:40:3F:1A:84:BF`. User added it to Firebase. **Not yet confirmed working** — was about to test after the ~5min propagation wait when the conversation moved to Data safety form questions.

### Not done / next steps
1. Confirm Google Sign-In now works on the existing Internal testing install (no rebuild needed for this — server-side check).
2. Finish the Data safety form (still going through Data types → then Data usage/handling → Preview → submit).
3. **Rebuild** (`eas build --platform android --profile production`) to ship the permissions fix (removes the 13 unused permissions) → produces versionCode 3.
4. Upload new AAB to Internal testing (manual upload — `play-service-account.json` for `eas submit` was never actually set up; low priority, can stay manual).
5. Complete remaining Play Console checklist: store listing copy (short/full description, feature graphic 1024×500, ≥2 screenshots), content rating questionnaire, app access (reviewer test credentials), target audience (recommended: 18+).
6. Promote to Production only after step 3/4 (do NOT promote versionCode 2 — it has the permission/Data-safety mismatch).
7. Known non-blocking issue: `test.api.amadeus.com` / `api.amadeus.com` have no DNS record globally as of Aug 2026 (confirmed via Google/Cloudflare/Quad9 DoH and Amadeus's own Akamai nameservers) — flight search returns 500 `getaddrinfo ENOTFOUND`. Not an app bug; needs an Amadeus support ticket. Mock flights deliberately NOT enabled (user's explicit instruction).
8. Two untracked stray files sitting in the web repo root, safe to delete whenever: `jet.png`, `assets/loose_assets/jet.png`.
