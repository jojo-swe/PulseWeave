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
