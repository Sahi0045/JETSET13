## Cursor Cloud specific instructions

### Project Overview
Jetsetterss is a React + Express.js travel booking platform. See `README.md` for full details.

### Architecture
- **Frontend**: React 18 + Vite dev server on port 5173
- **Backend**: Express.js API on port 5004 (entry: `backend/server.js`, wrapper: `server.js`)
- **Database**: Supabase (cloud PostgreSQL)
- **External APIs**: Amadeus (flights/hotels), ARC Pay (payments), Firebase (auth), Resend (email)

### Running the App
The `npm run dev` script (`start-dev.js`) starts both servers, but it invokes `nodemon` without `node_modules/.bin` in PATH, so it fails in non-npm-script contexts. Instead, start them separately:

```
PORT=5004 npm run server   # Backend on port 5004 (nodemon)
npm run client             # Frontend on port 5173 (vite)
```

The Vite dev server proxies `/api` requests to `http://localhost:5004`.

### Critical: PORT environment variable
The injected `PORT` secret defaults to a non-5004 value. Always override with `PORT=5004` when starting the backend, or the Vite proxy won't reach it.

### .env file
The app reads env vars from `.env` via `dotenv`. Create it from injected environment secrets:
```
env | grep -E '^(VITE_|SUPABASE_|AMADEUS_|JWT_|REACT_APP_|ARC_PAY_|ARC_TRAVEL_|RESEND_|ADMIN_|FRONTEND_|CORS_)' | grep -v CLOUD_AGENT | sort > .env
echo "PORT=5004" >> .env
echo "NODE_ENV=development" >> .env
```

### Tests
- `npm test` runs vitest (8 test files, 118 tests)
- No ESLint/lint config exists in the project

### Build
- `npm run build` runs `vite build`
