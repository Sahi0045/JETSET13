# Deploying the API

The API runs on a Lightsail instance in Frankfurt rather than on Vercel, for two
reasons. Amadeus allow-lists a **fixed egress IP**, which serverless cannot
offer; and a booking is ten sequential GDS calls, which does not reliably fit
inside an edge function's timeout.

Vercel keeps serving the site and rewrites `/api/*` here, so **no client release
is needed** — both the web app and the mobile app already point at
`www.jetsetterss.com/api`.

| | |
|---|---|
| Instance | `jetsetters-api`, Ubuntu 24.04, Frankfurt (`eu-central-1a`) |
| Static IP | `63.187.206.178` — **this is the address Amadeus allow-lists** |
| Domain | `api.jetsetterss.com` |
| Stack | Caddy (TLS) → app (Express, `:5004`) → Redis (cache) |
| Registry | `ghcr.io/sahi0045/jetsetters-api` |

---

## First-time setup

### 1. Provision the host

```bash
ssh -i ~/Downloads/jetset.pem ubuntu@63.187.206.178
curl -fsSL https://raw.githubusercontent.com/Sahi0045/JETSET13/main/deploy/bootstrap.sh | sudo bash
```

Installs Docker, creates the `deploy` user, turns on ufw/fail2ban/unattended
security upgrades, and creates `/opt/jetsetters`.

It does **not** touch the `ubuntu` user's SSH access — deliberately. Losing
access to the box is worse than a marginally less hardened one.

### 2. Put the configuration in place

```bash
sudo install -m 640 -o root -g deploy /dev/null /opt/jetsetters/.env
sudo nano /opt/jetsetters/.env          # see .env.example in the repo root
```

`.env` never lives in the image, the repo, or CI. One copy, on this box only.

`root:deploy 640` rather than `root:root 600`: `docker compose` reads `env_file`
as the invoking user, CI invokes it as `deploy`, and `deploy` has no sudo by
design. Root-only ownership fails the deploy with
`open /opt/jetsetters/.env: permission denied`, which looks like a Docker
problem and is not.

Then copy the two config files across from a checkout:

```bash
scp -i ~/Downloads/jetset.pem deploy/docker-compose.yml deploy/Caddyfile \
  ubuntu@63.187.206.178:/tmp/
ssh -i ~/Downloads/jetset.pem ubuntu@63.187.206.178 \
  'sudo mv /tmp/docker-compose.yml /tmp/Caddyfile /opt/jetsetters/'
```

### 3. Point DNS at the host

`api.jetsetterss.com  A  63.187.206.178`

Caddy obtains the certificate itself on first start, so **DNS must resolve
before step 4** — the ACME HTTP challenge fails otherwise, and repeated failures
count against Let's Encrypt rate limits.

### 4. Start it

```bash
cd /opt/jetsetters && docker compose up -d
docker compose ps
curl -fsS https://api.jetsetterss.com/api/health
```

### 5. Route Vercel's `/api/*` here

In `vercel.json`, **before** the existing `/api/(.*) → /api/index.js` rule
(first match wins):

```json
{ "source": "/api/(.*)", "destination": "https://api.jetsetterss.com/api/$1" }
```

### 6. Wire up CI deploys

Repository secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | `63.187.206.178` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | private key whose public half is in `/home/deploy/.ssh/authorized_keys` |

Generate a **CI-only** key rather than reusing `jetset.pem` — a key in CI should
be revocable without locking you out of the box:

```bash
ssh-keygen -t ed25519 -f ci_deploy -C "github-actions" -N ""
# public half onto the box:
ssh -i ~/Downloads/jetset.pem ubuntu@63.187.206.178 \
  "sudo tee -a /home/deploy/.ssh/authorized_keys < /dev/stdin" < ci_deploy.pub
# private half into the VPS_SSH_KEY secret, then delete the local copy
```

---

## Routine operations

**Deploying** happens automatically: merge to `main` → CI passes → `Deploy API`
builds, pushes to GHCR, pulls on the host, and waits for the container to report
healthy before declaring success.

**Rolling back** to any previously built commit:

```bash
cd /opt/jetsetters
APP_IMAGE=ghcr.io/sahi0045/jetsetters-api:<short-sha> docker compose up -d
```

Every build is tagged with its short SHA, so this is a pull rather than a
rebuild.

**Logs:**

```bash
docker compose logs -f app          # application
docker compose logs -f caddy        # TLS, ACME, request errors
tail -f /var/log/caddy/access.log   # access log (JSON)
```

**Turning flights off** without a deploy — the kill switch:

```bash
sudo sed -i 's/^AMADEUS_WS_ENABLED=.*/AMADEUS_WS_ENABLED=false/' /opt/jetsetters/.env
docker compose restart app
```

Flight endpoints then return a clean 503 instead of failing unpredictably.
`AMADEUS_WS_BOOKING_ENABLED` does the same for booking alone.

**Switching to the production WSAP** after certification is an edit to
`/opt/jetsetters/.env` (endpoint, WSAP, username, password, office,
`AUTO_TICKET`) and `docker compose restart app`. No rebuild — that is the point
of keeping all of it in the environment.

---

## What to back up

Only two things on this box are not reproducible from the repo:

1. `/opt/jetsetters/.env` — the credentials
2. the `caddy_data` volume — the Let's Encrypt account key and certificates

```bash
docker run --rm -v jetsetters_caddy_data:/data -v /tmp:/backup alpine \
  tar czf /backup/caddy_data.tgz -C /data .
```

Supabase is managed and backs itself up. Redis is a cache — losing it costs a
few cold requests and nothing else.
