# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
