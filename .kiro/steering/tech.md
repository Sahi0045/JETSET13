# Tech Stack

ES modules (`"type": "module"`) throughout. JavaScript only — there is no TypeScript, no lint, and no typecheck script (`jsconfig.json` only).

## Frontend

- **React 18** with **Vite 7** (`@vitejs/plugin-react`)
- **React Router DOM 7**, lazy-loaded routes
- **Tailwind CSS** (v3 config + `@tailwindcss/vite`), PostCSS, autoprefixer, Bootstrap (legacy), `@headlessui/react`
- Icons: `lucide-react`, `react-icons`, FontAwesome
- SEO: `react-helmet` / `react-helmet-async`
- Dates: `date-fns`, `dayjs`, `react-datepicker`
- PDF/export: `jspdf`, `html2canvas`, `xlsx`, `papaparse`
- Error tracking: `@sentry/react`

## Backend

- **Node.js / Express 4**
- **Supabase** (`@supabase/supabase-js`) — auth + Postgres, system of record
- **Firebase** / `firebase-admin` — legacy/secondary auth, still referenced in some pages
- **Amadeus** — flight/hotel inventory
- Email: **Resend**; SMS: **Twilio**; cache: **ioredis**
- Chatbot/AI: **Google Gemini** (`@google/genai`, `@langchain/google-genai`), `langchain`, `@modelcontextprotocol/sdk`
- Auth tokens: `jsonwebtoken`, `bcryptjs`; security: `helmet`, `cors`, `express-rate-limit`
- Logging: `pino` / `pino-http`; validation: `zod`; uploads: `multer`
- Error tracking: `@sentry/node`

## Common Commands

```bash
# Dev (preferred): backend on :5004 + Vite on :5173, Vite proxies /api → :5004
npm run dev

# Pieces individually
npm run server         # nodemon server.js on :5004
npm run client         # vite dev server on :5173

# Build & run prod
npm run build          # vite build → dist/, then scripts/copy-public-assets.js
npm start              # NODE_ENV=production node server.js

# Tests (Vitest, three projects)
npm test                                      # all projects
npm run test:frontend                         # jsdom (React)
npm run test:backend                          # node (controllers/services)
npm run test:integration                      # serial, supertest API tests
npm run test:watch                            # watch mode
npx vitest run tests/path/to/file.test.js     # single file
npx vitest run -t "expected behavior name"    # filter by test name

# Standalone integration scripts (hit real APIs, not Vitest)
npm run test:hotel-api / test:direct-amadeus / test:supabase / test:chatbot ...
```

## Testing notes

- **Vitest** with three projects defined in `vitest.config.js`: `frontend` (jsdom), `backend` (node), `integration` (serial — `sequence.concurrent: false` because it hits a real DB).
- Coverage uses v8 across `backend/**` and `frontend/src/**`.
- Mocks belong **only** in test files.

## Deployment

- **Vercel** (primary, `vercel.json`): `npm run build`, serves `dist/`, routes `/api/*` to the single function `api/index.js`. Long-running jobs/background workers do NOT belong in the serverless handler.
- **Render** (`render.yaml`, `render-setup.js`) and **Docker** (`dockerfile`, `docker-compose.yml`, `Makefile`) deploy the full `server.js` monolith.
- `server.js` checks `VERCEL_ENV` and skips `app.listen` when serverless. Do not add unconditional `listen()` calls at module load.

## Env & secrets

- Env vars live in `.env*` files. Never hardcode secrets.
- Most services fail silently if env vars are misconfigured (Amadeus presence is logged on startup; others are not).
