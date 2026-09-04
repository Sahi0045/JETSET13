# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Build stage: install everything, produce dist/
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

# puppeteer is a production dependency (backend/services/content-indexer.js) but
# nothing the server loads at boot imports it - only backend/jobs/content-indexing.js
# does, and that is a standalone script nothing starts. Downloading Chromium here
# would add ~400 MB to a layer no request ever touches. If that job is ever moved
# into the server, this has to change and alpine needs its own chromium package.
ENV PUPPETEER_SKIP_DOWNLOAD=1

WORKDIR /app

# Dependencies first: this layer is cached until the lockfile actually changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# vite build -> dist/, then copy-public-assets and generate-route-seo-pages.
RUN npm run build

# Reinstall without dev dependencies, so only what the server needs is copied on.
RUN npm ci --omit=dev

# ─────────────────────────────────────────────────────────────────────────────
# Runtime stage: the server and nothing else
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PORT=5004

# curl for the healthcheck; tini so signals reach node and the container stops
# promptly instead of waiting out Docker's 10 s kill timeout on every deploy.
RUN apk add --no-cache curl tini

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist

# Exactly what server.js reaches for at runtime, and no more:
#   server.js       the entry point
#   backend/        routes, services, jobs
#   shared/            ./shared/spaRoutes.js          (server.js:49)
#   frontend/src/seo/  ./frontend/src/seo/routeSeo.js (server.js:50)
#   frontend/src/data/ routeSeo.js imports destinationImages.js from it - a
#                      transitive dependency, so copying only seo/ builds a
#                      perfectly good image that dies on boot with
#                      ERR_MODULE_NOT_FOUND.
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/backend ./backend
COPY --from=build /app/shared ./shared
COPY --from=build /app/frontend/src/seo ./frontend/src/seo
COPY --from=build /app/frontend/src/data ./frontend/src/data

# The node image ships an unprivileged `node` user; use it rather than root.
USER node

EXPOSE 5004

# Hits the app's own health route, so an unhealthy container is one that cannot
# serve rather than one whose process merely exists.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5004/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
