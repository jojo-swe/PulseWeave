# CLAUDE.md

Guidance for AI assistants working in the PulseWeave repo. Every path, name and command below was checked against the code on `master`.

**Last verified:** 2026-09-28 (against `master` @ `f195bea`)

---

## What this is

PulseWeave is a team chat platform (channels, DMs, threads, reactions, E2E-encrypted DMs, RBAC, MFA, file uploads). It is a **pnpm workspace monorepo** (`pnpm@10`, Node 20+).

| Package | Path | Stack | Notes |
|---|---|---|---|
| `frontend` | `apps/frontend` | Next.js 16.1 (App Router, Turbopack), **React 18.3**, Tailwind, Radix UI, Zustand 4 | The main web client. Dev port **9797** |
| `backend` | `apps/backend` | Express 4, Socket.io, Prisma 5, Zod, Vitest | REST API + realtime. Dev port **9090** |
| `web` | `apps/web` | Next.js 16.1 | **Marketing landing page only**, not the chat client |
| `pulseweave-desktop` | `apps/desktop` | Electron 35 + electron-vite | |
| `pulseweave-mobile` | `apps/mobile` | Expo 50 / React Native 0.73 | |
| `@pulseweave/database` | `packages/database` | Prisma schema + client singleton | |
| `@pulseweave/types` | `packages/types` | Shared TS interfaces + socket event types | |

The README says React 19; the installed version is **18.3.1**. Trust `package.json`.

---

## Commands

Run from the repo root unless noted.

```bash
pnpm install
pnpm db:generate                      # Prisma client; required after install and after schema changes

pnpm dev                              # backend + frontend together
pnpm dev:backend / pnpm dev:frontend
pnpm dev:desktop

pnpm build                            # db:generate → types → database → backend → frontend
pnpm typecheck                        # = backend `tsc` + frontend `next build`
pnpm lint                             # frontend then backend
pnpm test                             # backend Vitest suite

pnpm db:push                          # sync schema to a dev DB
pnpm db:migrate                       # create/apply a migration
pnpm db:studio
```

Single test file: `cd apps/backend && npx vitest run src/services/rbac.test.ts`

### Gotchas that will bite you

1. **Build the shared packages before running backend tests.** `@pulseweave/types` and `@pulseweave/database` point `main` at `./dist/index.js`. On a fresh checkout, Vitest fails 36 of 50 suites with `Failed to resolve entry for package "@pulseweave/database"`. Fix:
   ```bash
   pnpm db:generate
   pnpm --filter @pulseweave/types build && pnpm --filter @pulseweave/database build
   ```
   After that, all 50 files / 701 tests pass.
2. **`pnpm dev:mobile` and `pnpm build:mobile:*` are broken.** They filter on `mobile`, but the package is named `pulseweave-mobile`. Use `pnpm --filter pulseweave-mobile start`.
3. **`pnpm typecheck` does not typecheck backend tests.** `apps/backend/tsconfig.json` excludes `**/*.test.ts`, and the test files currently have ~30 type errors (half in `src/socket/index.test.ts`). Vitest still runs them, since it transpiles without typechecking.
4. **Frontend `next build` fetches Google Fonts** (`Inter` in `src/app/layout.tsx`). It fails in offline or sandboxed environments; that's a network problem, not a code error.
5. **The DB is SQLite by default** (`packages/database/prisma/schema.prisma`, `provider = "sqlite"`, `prisma/dev.db`). The comment in the schema explains switching to PostgreSQL for production.
6. `pnpm stop:dev` is PowerShell and only works on Windows.

---

## Backend (`apps/backend/src`)

```
index.ts          app setup; ALL routers are mounted here
routes/           one file per resource (auth, user, workspace, channel, message, dm, …)
middleware/       auth, rbac, validate, error-handler, security, advanced-security, ssl, rate-limit-tenant, request-logger
services/         business logic (rbac, mfa, encryption, email, ldap, storage, webhooks, notifications, health, …)
socket/index.ts   all Socket.io handlers
config/           environment.ts (Zod env schema), security.ts
utils/            logger, workspace-access, url-validator, graceful-shutdown
scripts/          create-admin.ts  (pnpm --filter backend create:admin)
```

Tests sit next to their source as `*.test.ts`.

### Imports

The backend has **no `@/` alias**. Use relative imports plus the workspace packages:

```ts
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
```

There is no `middleware/index.ts` barrel, so import from each file.

### Authentication is applied at mount time, not in the router

`index.ts` wraps most routers: `app.use('/api/channels', authenticateToken, channelRouter)`. Inside a router, handlers can assume `req.userId` is set (typed as `AuthRequest`).

Exceptions that mount **without** `authenticateToken` and handle auth themselves: `/api/auth`, `/api/upload`, `/api/mfa`, `/api/payments`, `/api/external` (API-key auth), and the webhook receiver at `/api`. When adding a router, register it in `index.ts` and decide explicitly which case it is.

### Route handler pattern

Copy this shape from `routes/channel.ts`:

```ts
const createChannelSchema = z.object({ workspaceId: z.string(), name: z.string().min(1).max(50) });

router.post('/', validate(createChannelSchema), asyncHandler(async (req: AuthRequest, res) => {
  const { workspaceId, name } = req.body;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: req.userId!, workspaceId } },
  });
  if (!membership) throw Errors.forbidden();
  // …
  res.json(result);
}));
```

- **Validation:** `validate(schema)` from `middleware/validate.ts` (also `validateAll`, and reusable `uuidSchema`, `paginationSchema`, `passwordSchema`, `emailSchema`, `usernameSchema`).
- **Errors:** throw `Errors.badRequest | unauthorized | forbidden | notFound | conflict | tooManyRequests | validation | internal`, or `new AppError(message, statusCode, code)`. `asyncHandler` forwards them to the global `errorHandler`, which also maps Zod and Prisma errors.
- **Authorization:** always check workspace/channel membership. The middleware in `middleware/rbac.ts` is `requirePermission(permission, getWorkspaceId?)`, `requireAnyPermission`, `requireAllPermissions`, `requireRole`, `requireOwner`, `requireAdmin` and `requireModerator`. Permission definitions are in `services/rbac.ts`. `utils/workspace-access.ts` has helpers for the membership checks.

### Config and logging

- **Env:** the Zod schema is in `config/environment.ts`. Read it through `getConfig()` (plus `isProduction()`, `isDevelopment()`, `getCorsOrigins()`). Prefer `getConfig()` in new code; about 20 files still read `process.env` directly.
- **Logging:** `import { logger } from '../utils/logger'`. That's the one most of the codebase uses; `services/logger.ts` is the Sentry-integrated one used at bootstrap. `no-console` is an ESLint **error** in backend source (it's allowed in tests and scripts).
- The backend tsconfig is strict, plus `noUncheckedIndexedAccess` (indexed access returns `T | undefined`, so handle it).

### Socket.io (`socket/index.ts`)

Connections require a valid JWT and a non-revoked session. The events it handles are `workspace:join`, `channel:join`/`leave`, `dm:join`/`leave`, `message:send`, `typing:start`/`stop`, `reaction:add`/`remove` and `disconnect`. Every handler that touches a channel or message **re-verifies membership**, so keep that invariant. Shared event types are in `packages/types/src/index.ts`.

---

## Frontend (`apps/frontend/src`)

```
app/            App Router pages (login, register, admin, settings, status, verify-email, …); page.tsx = chat UI
components/     chat/, settings/, onboarding/, ui/ (Radix-based primitives)
hooks/          useEncryption, usePermissions, useOptimistic, useNetworkStatus, …
lib/            api.ts (HTTP client), socket.ts, encryption.ts, push.ts, stripe.ts, revenuecat.ts, utils.ts
store/index.ts  single Zustand store: `useStore` (persisted: token, user, currentWorkspace, …)
config/env.ts   API_URL, STRIPE_PUBLISHABLE_KEY, REVENUECAT_API_KEY, VAPID_PUBLIC_KEY, IS_PRODUCTION
```

`@/` maps to `src/` (frontend only).

### API calls: the rule that matters most

Use `api` from `@/lib/api`. Its generic helpers **prepend `/api` for you**:

```ts
await api.get('/users/me');          // → GET /api/users/me   ✅
await api.get('/api/users/me');      // → GET /api/api/users/me ❌
```

The typed namespaces (`api.users.*`, `api.channels.*`, `api.workspaces.*`, …) already include `/api`. The client attaches the auth token and the `X-Workspace-ID` header from the store, retries idempotent requests with backoff, and throws `ApiError` (`status`, `code`, `isNetworkError`, `isRetryable`). See `docs/API_CONVENTIONS.md`.

### Env vars

Import from `@/config/env`; don't read `process.env.NEXT_PUBLIC_*` directly. **About 11 existing files break this rule** (`status-banner.tsx`, `SecuritySettings.tsx`, `SessionManagement.tsx`, `useNetworkStatus.ts`, `useEncryption.ts`, and several auth/status pages). They hard-code `http://localhost:9090` fallbacks and raw `fetch`. Don't copy them; migrate them when you touch them. `useEncryption.ts` puts `/api` in its base URL, unlike the others.

### Lint state

The frontend uses the ESLint 9 flat config (`eslint.config.mjs`), where `@typescript-eslint/no-explicit-any` is an **error**. `pnpm lint:frontend` currently **fails**: 166 errors, 165 of them `no-explicit-any`. Don't add new `any`s; don't treat the existing failures as caused by your change. The backend still uses the legacy `.eslintrc.json` (ESLint 8) and passes with 1 warning.

### Naming (as the code actually is)

- Components: PascalCase files (`ChatArea.tsx`, `ThreadPanel.tsx`). Radix primitives in `components/ui/` use kebab-case (`button.tsx`, `command-palette.tsx`).
- Hooks: `useXxx.ts`. Backend files: lower-case/kebab (`error-handler.ts`, `rate-limit-tenant.ts`).

---

## Shared packages

- **`packages/database`**: `prisma/schema.prisma`; `src/index.ts` exports the `prisma` singleton and re-exports `@prisma/client` types. After schema edits run `pnpm db:generate`, then `db:push` (dev) or `db:migrate`.
- **`packages/types`**: domain interfaces (User, Workspace, Channel, Message, DirectMessage, Reaction, Attachment) and socket event types.

Both need `pnpm --filter <name> build` for anything that resolves them through `dist/` (Vitest, `node dist`).

---

## Security rules (non-negotiable)

- Never commit `.env` files or secrets. Document new vars in `.env.example` and the relevant config schema.
- Validate every request body with Zod, and check membership/permissions server-side for every workspace/channel/message access, including in socket handlers.
- Files are served only through the authenticated `/uploads/:filename` route and `StorageService` (path sanitization, magic-byte checks). Don't add static upload serving.
- Production: `JWT_SECRET` must be ≥32 chars (64 recommended); set `COOKIE_SECRET` (≥32 chars); set `SSL_ENABLED=true` or `BEHIND_PROXY=true` so cookies get `Secure`. See `docs/SECURITY_CHECKLIST.md`, `PRODUCTION.md` and `docs/SSL.md`.

---

## Before you commit

```bash
pnpm --filter backend build          # backend types
pnpm lint:backend                    # must stay error-free
pnpm test                            # after building the shared packages (see Gotcha 1)
pnpm --filter frontend build         # needs network for Google Fonts
```

- Don't introduce new frontend lint errors, even though the baseline already fails.
- No `console.log` (backend: `logger`; frontend: `console.error`, `console.warn` or `console.info` only).
- No `@ts-ignore` without a description; avoid `any`.

---

## Other docs

`README.md` (overview; some version numbers are stale) · `docs/BEST_PRACTICES.md` · `docs/API_CONVENTIONS.md` · `docs/SECURITY_CHECKLIST.md` · `docs/SSL.md` · `PRODUCTION.md` · `docs/BETA_DEPLOYMENT.md` · `ROADMAP.md` · `CHANGELOG.md`

Deployment: `Dockerfile`, `docker-compose.yml` (services `backend`, `frontend`) and `deploy/beta/`. There's no CI workflow in the repo (`.github/` doesn't exist).

**Keep this file honest:** if you change a convention, a command or a known issue listed here, update this file in the same commit.
