# Beta Deployment (VPS + Docker Compose + Caddy)

This document describes how to deploy PulseWeave for a private beta at:

- `https://beta.pulsweave.app`

## Goals

- Cheap and practical for a one-person team.
- Secure by default.
- Minimal operational overhead.

## Architecture

- **Caddy (reverse proxy + TLS)**
  - Terminates TLS (Let’s Encrypt).
  - Routes traffic:
    - `/api/*` -> backend
    - `/socket.io/*` -> backend
    - `/uploads/*` -> backend
    - `/health*` and `/metrics` -> backend
    - everything else -> frontend
- **Backend (Node/Express + Socket.IO)**
  - Runs on internal Docker network (`backend:9090`).
  - Uses `BEHIND_PROXY=true` because TLS is terminated at Caddy.
- **Frontend (Next.js)**
  - Runs on internal Docker network (`frontend:3000`).

## Pseudocode

```text
betaDeploy():
  set DNS: beta.pulsweave.app -> VPS_PUBLIC_IP
  harden VPS (ssh keys, firewall 22/80/443)
  install docker + docker compose
  clone repo
  configure env secrets
  docker compose up (base compose + beta override)
  verify https + health endpoints
  run smoke tests
```

## Prerequisites

- VPS with:
  - public IPv4
  - Docker installed
  - inbound ports 80/443 reachable from the internet
- A domain you control (`pulsweave.app`) and DNS access.

## Step 1: DNS

Create a DNS record:

- **Type**: `A`
- **Name**: `beta`
- **Value**: `<YOUR_VPS_PUBLIC_IP>`

Wait until it resolves:

- `beta.pulsweave.app` should resolve to the VPS IP.

## Step 2: VPS hardening baseline

- **SSH**
  - Use SSH keys (disable password auth).
  - Disable root login.
- **Firewall**
  - Allow inbound:
    - `22/tcp` (SSH)
    - `80/tcp` (HTTP)
    - `443/tcp` (HTTPS)
  - Deny everything else inbound.

Do **not** expose backend/frontend ports publicly.

## Step 3: Clone the repo on the VPS

```bash
git clone <YOUR_REPO_URL>
cd PulseWeave
```

## Step 4: Configure beta environment variables

The beta deployment uses:

- `docker-compose.yml` (base)
- `deploy/beta/docker-compose.beta.yml` (beta override)

Copy the template:

```bash
cp deploy/beta/.env.example deploy/beta/.env
```

Edit `deploy/beta/.env` and set:

- `BETA_DOMAIN=beta.pulsweave.app`
- `FRONTEND_URL=https://beta.pulsweave.app`
- `CORS_ORIGINS=https://beta.pulsweave.app`
- `NEXT_PUBLIC_API_URL=https://beta.pulsweave.app`

### Secrets

Generate strong secrets and paste them into `deploy/beta/.env`:

- `JWT_SECRET` (recommended 64+ chars)
- `COOKIE_SECRET` (recommended 32+ chars)

Example generation commands:

```bash
# 64 bytes -> 128 hex chars
openssl rand -hex 64

# 32 bytes -> 64 hex chars
openssl rand -hex 32
```

## Step 5: Start the stack

Run from the repo root:

```bash
docker compose \
  --env-file deploy/beta/.env \
  -f docker-compose.yml \
  -f deploy/beta/docker-compose.beta.yml \
  up -d --build
```

## Step 6: Verify the deployment

- **Frontend**
  - Visit `https://beta.pulsweave.app`
- **Backend health**
  - `https://beta.pulsweave.app/health/live`
  - `https://beta.pulsweave.app/health/ready`
  - `https://beta.pulsweave.app/health`

If health works over HTTPS, Caddy routing is correct.

## Step 7: Smoke tests (must-pass for beta)

Run these manually in the UI (and keep notes):

- **Auth/session**
  - sign up
  - login
  - refresh session (close/reopen browser)
  - logout
- **RBAC/workspaces**
  - create workspace
  - invite/join
  - verify you cannot access a workspace you are not a member of
- **Socket.IO**
  - open app in two browsers
  - send message
  - verify real-time delivery
  - add reaction
  - remove reaction
- **Uploads**
  - upload file
  - download file while logged in
  - verify download fails when logged out

## Operations

### View logs

```bash
docker compose -f docker-compose.yml -f deploy/beta/docker-compose.beta.yml logs -f --tail=200
```

### Restart

```bash
docker compose -f docker-compose.yml -f deploy/beta/docker-compose.beta.yml restart
```

### Update (pull + rebuild)

```bash
git pull

docker compose \
  --env-file deploy/beta/.env \
  -f docker-compose.yml \
  -f deploy/beta/docker-compose.beta.yml \
  up -d --build
```

### Persistence

The base `docker-compose.yml` defines volumes for:

- SQLite database
- uploads

These persist across container restarts.

## Troubleshooting

### TLS certificate does not issue

- Ensure DNS `A` record points to the VPS.
- Ensure ports 80/443 are reachable.
- Check Caddy logs:
  - `docker logs <caddy_container_id>`

### Frontend loads but API calls fail (CORS)

- Ensure `CORS_ORIGINS=https://beta.pulsweave.app` in `deploy/beta/.env`.
- Ensure `FRONTEND_URL=https://beta.pulsweave.app` in `deploy/beta/.env`.
- Rebuild/restart.

### WebSockets not connecting

- Confirm `/socket.io/*` is routed to backend in `deploy/beta/Caddyfile`.
- Confirm your VPS firewall allows 443.

### Upload download is broken

- Upload download is served from `/uploads/:filename` and requires auth.
- Confirm `/uploads/*` is routed to backend.

## Security notes

- Use unique secrets for beta.
- Keep `.env` files private on the VPS.
- Only expose 80/443 publicly.
- Terminate TLS at Caddy and use `BEHIND_PROXY=true` on the backend.
