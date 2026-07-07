# Project Structure

## Three entry points for the same Express app

Understand this before editing routes. The same app is served three ways:

1. **`server.js` (repo root)** — production monolith (`npm start`). Mounts routes under `/api/*`, serves the built SPA from `dist/`, and has a direct `/api/send-email` endpoint that exists *only* here.
2. **`backend/server.js`** — the dev backend (launched by `scripts/start-dev.js` via nodemon). Adds middleware (audit logging, redaction) and background jobs (`workflowEngine`, `dataRetention`, `checkQuoteExpiration`). Mounts the same routes plus `featureFlag`, `airport`, `analytics`.
3. **`backend/api/index.js`** — the Vercel serverless handler, re-exported by `api/index.js`. Mounts each route **twice** (at `/api/*` and `/*`) because Vercel rewrites `/api/(.*)` here. All routes are consolidated to stay under Vercel's 12-function limit.

**When adding a route, register it in all three places it belongs.** The route file itself lives in `backend/routes/`.

## Backend (`backend/`)

Standard Express layering:

- `routes/*.routes.js` — Express routers, one per resource
- `controllers/` — request handlers
- `services/` — business logic + integrations (`amadeusService`, `gemini.service`, `emailService`, `cache.service`, `sms.service`, `cdn.service`, etc.)
- `models/` — Supabase-backed data models
- `middleware/` — `auth.middleware.js` (Supabase JWT), `auditLog.middleware.js`
- `jobs/` — background jobs started from `backend/server.js`
- `config/` — `supabase.js` (single client), `chatbot.js` (Gemini), `jwt.js`
- `api/` — serverless handler and consolidated route mounting
- `bootstrap/`, `migrations/`, `tests/`

## Frontend (`frontend/`)

- Entry: `index.html` → `frontend/main.jsx` → `frontend/src/app.jsx`. App is wrapped in `BrowserRouter`, `HelmetProvider`, `SupabaseAuthProvider`, `LocationProvider`.
- `src/Pages/` — `Common/` for booking flows (`cruise`, `flights`, `hotels`, `packages`, `visa`, `rentals`), plus `Admin/`, `Profile/`, `Request/`
- `src/components/`, `src/hooks/`, `src/lib/`, `src/Services/`, `src/utils/`, `src/Context(s)/`, `src/config/`, `src/data/`
- Path aliases (in `vite.config.js`; Vitest replicates `@` separately): `@` → `frontend/src`, plus `@pages`, `@components`, `@src` → `frontend`
- Routes are lazy-loaded with `React.lazy(...).catch(() => Fallback)` so an import failure renders a loading shim instead of crashing. Mirror this for new top-level routes.
- **Bundle chunking**: `vite.config.js` defines explicit `manualChunks` — `react-vendor`, `ui-icons`, `date-utils`, `pdf-utils`, `bootstrap`, `admin`, `booking`, `vendor-misc`. Route heavy new dependencies into the right chunk rather than `vendor-misc`.

## Other top-level dirs

- `scripts/` — dev/prod launchers, DB maintenance, asset copy (`scripts/db/*.sql`, `scripts/maintenance/`)
- `supabase/migrations/` and `scripts/db/*.sql` — SQL schemas; migrations are **not** auto-applied (apply manually)
- `database/database.sqlite` — local SQLite used by some scripts
- `tests/` — Vitest suites; `public/`, `assets/`, `resources/` — static assets; `dist/` — build output
- `docs/` and root `*.md` guides — reference documentation

## Conventions

- camelCase for JS variables/functions, PascalCase for types/components
- Boolean prefixes: `is` / `has` / `should` / `can`
- No hardcoded secrets; use parameterized DB queries
- **Never reset or drop the database**; use migrations for schema changes
- Mocks belong only in test files
- See `.cursor/rules/software-engineering-standards.mdc` for the full ruleset
