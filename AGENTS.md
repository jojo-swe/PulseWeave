# AGENTS.md

Instructions for coding agents working in PulseWeave. This file is the source of truth. It covers how to navigate the repo and the conventions that are easy to get wrong. Longer standards live in the docs linked below.

## Overview

PulseWeave is a team communication platform in a pnpm workspace (Node.js 20+, pnpm 10+).

- **Frontend** (`apps/frontend`): Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS, Radix UI, Zustand, Socket.io client. Dev server: port **9797**.
- **Backend** (`apps/backend`): Express, Socket.io, Prisma (PostgreSQL), JWT sessions, RBAC. Dev server: port **9090**.
- **Desktop** (`apps/desktop`): Electron.
- **Mobile** (`apps/mobile`): React Native.
- **Shared packages**: `packages/types` (shared TypeScript types), `packages/database` (Prisma schema and client).

`@/` maps to `src/` in the frontend and backend apps.

## Monorepo map

```
apps/frontend/src/     Next.js app (chat UI, settings, admin)
apps/backend/src/      Express routes, middleware, services, sockets
apps/desktop/          Electron
apps/mobile/           React Native
packages/types/        Shared types
packages/database/     Prisma schema (prisma/schema.prisma) and client
docs/                  Project docs
deploy/                Deployment configs
```

Read the file that owns the area before editing it:

| Area | Start here |
| --- | --- |
| Frontend HTTP | `apps/frontend/src/lib/api.ts` |
| Frontend env | `apps/frontend/src/config/env.ts` |
| Frontend state | `apps/frontend/src/store/index.ts` |
| Frontend sockets | `apps/frontend/src/lib/socket.ts` |
| Backend entry | `apps/backend/src/index.ts` |
| Backend env | `apps/backend/src/config/environment.ts` |
| Auth | `apps/backend/src/middleware/auth.ts` |
| RBAC | `apps/backend/src/middleware/rbac.ts`, `apps/backend/src/services/rbac.ts` |
| Sockets | `apps/backend/src/socket/index.ts` |
| Logging | `apps/backend/src/utils/logger.ts` |
| Errors | `apps/backend/src/middleware/error-handler.ts` (`AppError`) |
| Schema | `packages/database/prisma/schema.prisma` |

## Critical conventions

### API prefix

Generic helpers in `apps/frontend/src/lib/api.ts` prepend `/api`. Pass the path without that prefix.

```typescript
import { api } from '@/lib/api';

await api.get('/users/me'); // GET /api/users/me
await api.post('/friends/request', {});
```

`api.get('/api/friends')` becomes `/api/api/friends`. Typed helpers (for example `api.users.getMe`) already include `/api`. The client attaches the auth token from the Zustand store and the current workspace. Full rules: [docs/API_CONVENTIONS.md](docs/API_CONVENTIONS.md).

### Environment

Import the validated config. Do not read `process.env` in application code.

```typescript
// Frontend
import { API_URL } from '@/config/env';

// Backend
import { config } from '@/config/environment';
const port = config.PORT;
```

A new variable belongs in the Zod schema (`apps/frontend/src/config/env.ts` or `apps/backend/src/config/environment.ts`) and the matching `.env.example`.

### Logging

Do not add `console.log`. Backend ESLint sets `no-console` to error. Use `logger` from `apps/backend/src/utils/logger.ts` (`logger.info`, `logger.warn`, `logger.error`). On the frontend, `no-console` warns and allows only `console.error`, `console.warn`, and `console.info`.

### Auth and RBAC

Protected HTTP routes use `authenticate` (JWT and session), then an RBAC check such as `requirePermission(...)`. After auth, `req.user` has `userId` and `workspaceId`. Validate bodies with Zod. Do not trust client-supplied roles, workspace ids, or channel membership.

Socket connections require a valid JWT, a session that has not been revoked, workspace membership, and channel access for channel events.

Throw backend errors with `new AppError(message, statusCode, code)` from `apps/backend/src/middleware/error-handler.ts`.

### TypeScript

Strict mode is on in both apps. Avoid `any`; use a real type or `unknown`. A `@ts-ignore` needs a descriptive comment of at least 10 characters. Match the surrounding code. Naming and quality rules: [docs/BEST_PRACTICES.md](docs/BEST_PRACTICES.md).

Workspace imports:

```typescript
import { prisma } from '@pulseweave/database';
import type { User } from '@pulseweave/types';
```

## Commands

Run these from the repo root.

```bash
pnpm install
pnpm db:generate       # after Prisma schema changes
pnpm dev               # frontend :9797 and backend :9090
pnpm dev:frontend
pnpm dev:backend
pnpm dev:desktop
pnpm dev:mobile

pnpm typecheck
pnpm lint              # frontend + backend
pnpm lint:frontend
pnpm lint:backend
pnpm build

pnpm test              # backend Vitest
pnpm test:backend

pnpm db:push           # push schema (development)
pnpm db:migrate        # create a migration
pnpm db:studio
```

Backend tests live in `apps/backend/src/**/*.test.ts`. The frontend has no test runner. Before committing application code, run `pnpm typecheck` and `pnpm lint`. Run `pnpm build` when the change touches types, the Prisma schema, or the build.

## Security non-negotiables

1. Never commit secrets or `.env` files, and never hardcode credentials.
2. Validate input with Zod on the backend.
3. Call `authenticate`, then check permissions with RBAC. Re-check workspace and channel access in socket handlers.
4. Query the database through Prisma. Serve stored files through `StorageService.getFileStream()` so paths are sanitized.
5. Before production, set `JWT_SECRET` (64+ characters) and `COOKIE_SECRET` (32+ characters) in `apps/backend/.env`, and set `SSL_ENABLED=true` or `BEHIND_PROXY=true`.

Completed remediations and the remaining production checklist: [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md). Deployment: [PRODUCTION.md](PRODUCTION.md). TLS: [docs/SSL.md](docs/SSL.md).

## When you change the code

1. Read the file and a nearby example of the same pattern before editing.
2. Keep the change local. Do not add a new abstraction for one call site.
3. New HTTP route: handler under `apps/backend/src/routes/`, `authenticate` plus the permission middleware, a Zod schema, and logic in `apps/backend/src/services/` when the handler would otherwise grow.
4. New model: edit `packages/database/prisma/schema.prisma`, run `pnpm db:generate`, add a migration with `pnpm db:migrate`, update `packages/types` when the type is shared, and add an RBAC permission when the model is workspace- or channel-scoped.
5. New environment variable: update the Zod schema and `.env.example`.
6. Update the docs when a behavior or convention changes.

## Read next

- [README.md](README.md) — quick start and scripts
- [docs/BEST_PRACTICES.md](docs/BEST_PRACTICES.md) — TypeScript, logging, git, pre-commit checks
- [docs/API_CONVENTIONS.md](docs/API_CONVENTIONS.md) — `/api` prefix and the API client
- [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md) — pre-production security tasks
- [PRODUCTION.md](PRODUCTION.md) — production deployment
- [docs/SSL.md](docs/SSL.md) — TLS setup

## Privacy / Integritet

Inga privata uppgifter får committas, och de får inte stå i PR-text (titel, beskrivning eller kommentar). Det gäller:

- personlig e-post — använd GitHubs noreply-adress i stället
- telefonnummer
- postadresser och hemadresser
- namn på privatpersoner
- interna IP-adresser
- Tailscale-värdnamn
- användarnamn i sökvägar
- nycklar och tokens
- innehåll i `.env`

Kör `pre-commit install` lokalt så att gitleaks granskar staged ändringar mot `.gitleaks.toml` före varje commit.

Agenter som hittar privata uppgifter maskerar dem med platshållare och skriver aldrig ut själva värdet i en commit, en pull request eller en logg. Använd till exempel `<email>`, `<user>`, `192.168.x.y`, `10.x.y.z`, `100.64.0.x` och `<host>.ts.net`.

---

<!-- agents-handover:rules -->
## Gemensamma agentregler (multi-agent)
Gemensamma regler för alla AI-agenter (Claude Code, Codex, molnagenter m.fl.) som arbetar i det här repot.
Flera agenter kan jobba här parallellt – utgå alltid från att någon annan kan ha pågående arbete.

### Innan du börjar

1. **Läs `HANDOVER.md`** – aktuellt läge, pågående arbete, nästa steg och kända problem.
2. **Kolla läget i git:**
   ```sh
   git status
   git fetch --all --prune
   git branch -a
   gh pr list --state open
   ```
3. **Gör inte om något som redan pågår.** Finns det en öppen PR, en aktiv branch eller en rad under
   "Pågående arbete" i `HANDOVER.md` som rör samma sak – bygg vidare på den eller fråga användaren.
4. Har arbetskatalogen ocommittade ändringar som inte är dina: rör dem inte. Använd en egen
   `git worktree` eller fråga användaren.

### Under arbetet

- **En branch per uppgift**, namnformat: `agent/<verktyg>/<kort-beskrivning>`
  (t.ex. `agent/claude/fix-login-timeout`, `agent/codex/add-csv-export`).
- Registrera ditt arbete under "Pågående arbete" i `HANDOVER.md` tidigt (agent, branch, status).
- **Committa ofta** med tydliga meddelanden.
- **Fråga alltid användaren innan destruktiva git-kommandon:** `push --force`, `reset --hard`,
  `clean -fd`, radera brancher (lokalt eller remote), `rebase` av delade brancher, `checkout -- .`.

### Innan sessionen avslutas

- **Inget arbete får lämnas ocommittat.** Committa (vid behov som WIP) och **pusha alltid** din branch.
- **Uppdatera `HANDOVER.md`:** aktuellt läge, pågående arbete, nästa steg, kända problem och en ny rad
  i loggen (datum, agent, vad som gjordes).
- Om repot saknar `AGENTS.md` eller `HANDOVER.md`: skapa dem från mallen
  (https://github.com/jojo-swe/repo-template) innan du börjar.

### Repo-specifikt (autodetekterat 2026-11-04)

#### Bygga och testa

- Installera: `pnpm install`
- dev: `pnpm dev`  (`concurrently "pnpm --filter backend dev" "pnpm --filter frontend dev"`)
- start: `pnpm start`  (`concurrently "pnpm start:backend" "pnpm start:frontend"`)
- build: `pnpm build`  (`pnpm db:generate && pnpm --filter types build && pnpm --filter database build && pnpm --filter backend build && pnpm --filter frontend build`)
- test: `pnpm test`  (`pnpm test:backend`)
- lint: `pnpm lint`  (`pnpm lint:frontend && pnpm lint:backend`)
- typecheck: `pnpm typecheck`  (`pnpm --filter backend build && pnpm --filter frontend build`)
- Docker: `docker compose up`
- CI: GitHub Actions (`privacy-guard.yml`)

#### Struktur

- `.agent/` (5 filer)
- `.github/` (1 filer)
- `.windsurf/` (3 filer)
- `apps/` (307 filer)
- `deploy/` (4 filer)
- `docs/` (15 filer)
- `marketing/` (13 filer)
- `packages/` (8 filer)
- `scripts/` (2 filer)
- Filer i roten: `.cascade-todo.md`, `.dockerignore`, `.editorconfig`, `.gitignore`, `.gitleaks.toml`, `.pnpm-approved-builds`, `.pre-commit-config.yaml`, `.prettierrc.js`, `AGENTS.md`, `app_spec.txt`, `CHANGELOG.md`, `claude-progress.txt`, `CLAUDE.md`, `COMMERCIAL-LICENSE.md`, `CONTRIBUTING.md` …

#### Övrigt

<!-- Konventioner, miljövariabler, deploy, saker agenter ska undvika. -->
