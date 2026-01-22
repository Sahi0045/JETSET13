# Jetsetterss - AI Coding Agent Instructions

## Architecture Overview

Full-stack travel booking platform: **React (Vite) frontend** + **Express.js backend** + **Supabase (PostgreSQL)**.

### Key Directories
- `resources/js/` - React frontend source (pages, components, contexts, services)
- `backend/` - Express server (routes, controllers, services, middleware)
- `api/` - Vercel serverless function wrappers (for production deployment)
- `server.js` - Main Express entry point (development/production)

### Data Flow
```
React Component → Frontend Service (resources/js/Services/) 
    → API call (/api/*) → Express Route (backend/routes/) 
    → Controller → Supabase/External API
```

## Development Commands

```bash
npm run dev          # Start both frontend (5173) + backend (5004) concurrently
npm run client       # Vite dev server only (port 5173)
npm run server       # Backend with nodemon (uses PORT from env)
npm run build        # Production build to dist/
npm start            # Production server (serves dist/ + API)
```

## Critical Patterns

### API Configuration
- Frontend uses Vite proxy: `/api` → `http://localhost:5006` (see [vite.config.js](vite.config.js#L77-L82))
- Backend port varies: `5004` (dev script), `5002` (default), or `PORT` env
- Production API: `https://www.jetsetterss.com/api`

### Authentication
- **Supabase Auth** is primary (see [SupabaseAuthContext.jsx](resources/js/contexts/SupabaseAuthContext.jsx))
- Backend validates tokens via `auth.middleware.js` - supports Supabase JWT, Google OAuth, and Firebase tokens
- Three middleware levels: `protect` (required), `optionalProtect` (optional), `admin` (admin only)

### Supabase Usage
- **Frontend**: Uses anon key from [resources/js/lib/supabase.js](resources/js/lib/supabase.js)
- **Backend**: Uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS (see [backend/config/supabase.js](backend/config/supabase.js))
- Key tables: `users`, `inquiries`, `quotes`, `bookings`, `callback_requests`

### External APIs
- **Amadeus API**: Flight/hotel search via [backend/services/amadeusService.js](backend/services/amadeusService.js)
  - Credentials: `AMADEUS_API_KEY` / `AMADEUS_API_SECRET` (or `REACT_APP_*` prefix)
  - Production endpoints: `https://api.amadeus.com/v{1,2,3}`
- **ARC Pay**: Payment processing via [backend/routes/payment.routes.js](backend/routes/payment.routes.js)
  - Uses action-based routing: `/api/payments?action=initiate-payment`
  - Basic Auth: `merchant.{MERCHANT_ID}:{API_PASSWORD}`

### Vercel Deployment Quirks
- Uses URL rewrites for path-based → query-param routing (see [vercel.json](vercel.json))
- Example: `/api/inquiries/my` → `/api/inquiries?endpoint=my`
- Backend routes handle both patterns for compatibility

## Code Conventions

### Frontend
- Path aliases: `@/` → `resources/js/`, `@pages/` → `resources/js/Pages/`, `@components/` → `resources/js/Components/`
- React.lazy() with error fallbacks for all page components
- Services in `resources/js/Services/` wrap API calls with axios

### Backend
- Route files: `backend/routes/{resource}.routes.js`
- Controllers: `backend/controllers/{resource}.controller.js`
- Always use `dotenv.config()` at file start for env vars

### Environment Variables
- Copy `.env.example` to `.env` for local development
- Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AMADEUS_*` keys
- ARC Pay: `ARC_PAY_MERCHANT_ID`, `ARC_PAY_API_PASSWORD`

## Testing
```bash
npm run test:supabase        # Supabase connection tests
npm run test:hotel-api       # Hotel API tests
npm run test:arc-pay-flight  # Payment integration tests
```

## Common Tasks

**Adding a new API route:**
1. Create route in `backend/routes/{name}.routes.js`
2. Register in `server.js`: `app.use('/api/{name}', routes)`
3. For Vercel: add serverless wrapper in `api/{name}.js`

**Adding a new page:**
1. Create component in `resources/js/Pages/`
2. Add lazy import + route in `resources/js/app.jsx`
3. Use `withPageElements` HOC for Navbar/Footer wrapping
