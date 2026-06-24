# 🚀 Jetsetters (JETSET13) — Travel Booking Platform

A full-stack travel booking platform covering **flights, hotels, cruises, vacation packages, visas, and rentals**, plus an admin / quote / inquiry workflow. Built with a **React (Vite)** frontend and a **Node.js / Express** backend, backed by **Supabase** (auth + Postgres) and a range of travel/payment integrations.

![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=for-the-badge&logo=supabase)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?style=for-the-badge&logo=tailwind-css)

---

## Overview

Jetsetters lets users search and book travel across multiple surfaces and gives staff an admin panel to manage quotes, inquiries, and bookings. The codebase is **ES modules throughout** (`"type": "module"`) and ships as a single Express app that can run as a monolith server, a dev backend, or a Vercel serverless function.

A companion **React Native (Expo)** mobile app lives in a sibling repository and consumes the same backend API.

## ✨ Features

- **✈️ Flights** — multi-city/round-trip/one-way search, fare options & upsells, seat and passenger handling (Amadeus inventory).
- **🏨 Hotels** — property search, rates, and booking.
- **🚢 Cruises** — cruise discovery, packages, and booking flows.
- **📦 Vacation Packages** — bundled itineraries and deals.
- **🛂 Visas** — visa requirements lookup and visa requests.
- **🚗 Rentals** — vehicle rental flows.
- **🧾 Quotes & Inquiries** — request-a-quote workflow with admin review and expiry handling.
- **🛠️ Admin Panel** — manage bookings, quotes, inquiries, coupons, templates, and bulk uploads.
- **🤖 AI Chatbot** — Google Gemini / LangChain assistant.
- **🔐 Auth** — Supabase (primary) with Firebase (legacy flows), Google OAuth.
- **💳 Payments** — ARC Pay gateway integration.
- **📧 / 📱 Messaging** — transactional email (Resend) and SMS (Twilio).

## 🧱 Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, React Router 7, Vite 7, Tailwind CSS 3, Headless UI, Lucide / FontAwesome / React Icons |
| Backend | Node.js, Express 4 |
| Auth & DB | Supabase (Postgres + Auth); Firebase (legacy); local SQLite for some scripts |
| Inventory | Amadeus (flights / hotels) |
| Payments | ARC Pay |
| AI | Google Gemini (`@google/genai`), LangChain |
| Messaging | Resend (email), Twilio (SMS) |
| Caching | Redis via `ioredis` |
| PDF / Files | jsPDF, html2canvas, Puppeteer, Multer, XLSX, PapaParse |
| Testing | Vitest (frontend / backend / integration), Testing Library, Supertest |
| Deploy | Vercel (primary), Render, Docker |

## 📁 Project Structure

```
JETSET13/
├── server.js                 # Production monolith server (npm start) — serves dist/ + /api/*
├── frontend/
│   ├── main.jsx              # App entry
│   └── src/
│       ├── app.jsx           # Root app (BrowserRouter, Supabase/Location providers)
│       ├── Pages/
│       │   ├── Common/       # Booking flows: cruise, flights, hotels, packages, visa, rentals, login
│       │   ├── Admin/        # Admin panel
│       │   ├── Profile/      # User profile
│       │   └── Request/      # Quote / inquiry requests
│       ├── components/       # Reusable UI
│       ├── contexts/         # React contexts
│       ├── hooks/            # Custom hooks
│       ├── Services/         # Frontend API/service clients
│       └── utils/            # Helpers
├── backend/
│   ├── server.js             # Dev backend (nodemon, extra middleware + jobs)
│   ├── api/index.js          # Vercel serverless handler (re-exported by api/index.js)
│   ├── routes/               # Express routers (flights, hotels, cruise, quote, inquiry, …)
│   ├── controllers/          # Request handlers
│   ├── services/             # Integrations (amadeus, gemini, email, cache, sms, cdn, …)
│   ├── models/               # Supabase-backed data models
│   ├── middleware/           # auth (Supabase JWT), audit logging
│   ├── jobs/                 # Background jobs (workflow engine, data retention, quote expiry)
│   └── config/               # supabase.js, chatbot.js
├── api/index.js              # Vercel entry → re-exports backend/api/index.js
├── scripts/                  # Dev/build/start helpers, db SQL, maintenance
├── supabase/migrations/      # SQL migrations
├── tests/                    # Vitest suites
├── vite.config.js            # Vite config + manualChunks + @ aliases
├── vitest.config.js          # Three test projects (frontend/backend/integration)
├── vercel.json               # Vercel routing (/api/* → single function)
├── render.yaml               # Render deploy config
└── dockerfile / docker-compose.yml
```

### Three entry points for the same Express app

This is the most important thing to know before editing routes:

1. **`server.js` (root)** — production monolith (`npm start`). Mounts `/api/*`, serves the built SPA from `dist/`, and has its own direct `/api/send-email` endpoint.
2. **`backend/server.js`** — the dev backend (launched by `scripts/start-dev.js` via nodemon). Adds audit logging, redaction, and background jobs.
3. **`backend/api/index.js`** — the Vercel serverless handler. Mounts every route twice (`/api/*` and `/*`) because Vercel rewrites `/api/(.*)` to this one function (12-function limit).

> When adding a route, register it in **all three** places. The route file itself lives in `backend/routes/`.

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** and **npm**
- **Git**
- A **Supabase** project (auth + Postgres)
- API credentials for the integrations you intend to use (Amadeus, ARC Pay, Resend, Twilio, Gemini)

### Installation

```bash
# 1. Clone
git clone https://github.com/Sahi0045/JETSET13.git
cd JETSET13

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# then fill in the values (see Environment Variables below)

# 4. Start the dev environment
npm run dev
```

`npm run dev` spawns the **backend on `:5004`** and the **Vite dev server on `:5173`**; Vite proxies `/api` requests to the backend.

### Build & run production

```bash
npm run build      # vite build → dist/, then copy-public-assets
npm start          # NODE_ENV=production node server.js
```

## 🧰 Common Commands

```bash
# Dev
npm run dev                # backend (:5004) + Vite (:5173) with /api proxy
npm run server             # backend only (nodemon)
npm run client             # Vite dev server only

# Build / prod
npm run build              # production build into dist/
npm start                  # run the production monolith

# Tests (Vitest — three projects)
npm test                   # all projects
npm run test:frontend      # jsdom (React)
npm run test:backend       # node (controllers/services)
npm run test:integration   # serial, supertest-driven API tests
npm run test:watch         # watch mode
npm run test:coverage      # coverage report
npx vitest run tests/path/to/file.test.js   # single file
npx vitest run -t "behavior name"           # filter by test name

# Standalone integration scripts (hit real APIs, not Vitest)
npm run test:hotel-api / test:direct-amadeus / test:supabase / test:chatbot ...
```

> There is no lint or typecheck script — this is a JS project with `jsconfig.json` only.

## 🔧 Environment Variables

Copy `.env.example` to `.env` and fill in your credentials. Key groups:

```env
# Supabase (primary auth + database)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Amadeus (flight/hotel inventory)
VITE_AMADEUS_CLIENT_ID=your_amadeus_client_id
VITE_AMADEUS_CLIENT_SECRET=your_amadeus_client_secret

# ARC Pay (payments)
ARC_PAY_MERCHANT_ID=your_merchant_id
ARC_PAY_API_PASSWORD=your_api_password
ARC_PAY_API_VERSION=100
ARC_PAY_BASE_URL=https://api.arcpay.travel/api/rest/version/100

# Email (Resend)
RESEND_API_KEY=your_resend_api_key
ADMIN_EMAIL=admin@yourcompany.com

# App
VITE_API_URL=http://localhost:5004/api
FRONTEND_URL=http://localhost:5173

# Firebase (legacy auth flows — optional)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
```

> Twilio (SMS) and Gemini (chatbot) keys are also required if you use those features. Many services fail silently if misconfigured — `server.js` logs the presence of Amadeus keys on startup.

## 🗄️ Database

**Supabase Postgres** is the system of record. SQL schemas live in `scripts/db/*.sql` and `supabase/migrations/`; a local `database/database.sqlite` is used by some scripts.

> Migrations are **not** auto-applied — apply them manually via Supabase or by running scripts in `scripts/maintenance/`. **Never reset or drop the database**; use migrations for schema changes.

## 🌍 Deployment

- **Vercel** (primary) — see `vercel.json`. Builds with `npm run build`, serves `dist/`, and routes `/api/*` to the single serverless function `api/index.js`. Long-running jobs / background workers belong in the `backend/server.js` path, not the serverless handler.
- **Render** — see `render.yaml` and `render-setup.js` (`npm run render-build`).
- **Docker** — `dockerfile`, `docker-compose.yml`, and `Makefile` run the full `server.js` monolith.

## 📱 Companion Mobile App

A separate **React Native (Expo SDK 54, RN 0.81, React 19)** client lives in a sibling directory (its own git repo) and consumes the **same backend API**. Backend changes that affect auth response shape, payment flows, or cruise/flight/hotel/request payloads should be sanity-checked against that repo's `src/services/*` layer.

## 🤝 Contributing

1. Create a feature branch (`git checkout -b feature/your-feature`)
2. Make your changes following the project conventions (camelCase JS, PascalCase types, boolean prefixes `is/has/should/can`, no hardcoded secrets, parameterized DB queries)
3. Add/update tests and run `npm test`
4. Commit and open a Pull Request

See `CLAUDE.md` and `.cursor/rules/software-engineering-standards.mdc` for the full architecture notes and engineering standards.

## 📄 License

ISC. See `package.json` for details.

---

**Built by the Jetsetters team.**
