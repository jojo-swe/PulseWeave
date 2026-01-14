# CLAUDE.md - AI Assistant Guide for PulseWeave

This document provides comprehensive guidance for AI assistants working on the PulseWeave codebase. It covers architecture, conventions, workflows, and best practices specific to this project.

**Last Updated**: 2026-01-14

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Codebase Structure](#codebase-structure)
4. [Development Workflows](#development-workflows)
5. [Key Conventions](#key-conventions)
6. [Security Guidelines](#security-guidelines)
7. [Common Tasks](#common-tasks)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)
10. [Important Files Reference](#important-files-reference)

---

## Project Overview

**PulseWeave** is a modern, secure team communication platform built as a monorepo using pnpm workspaces.

### Tech Stack Summary

**Frontend:**
- Next.js 16 (App Router + Turbopack)
- React 19
- TypeScript (strict mode)
- Tailwind CSS + Radix UI
- Zustand (state management)
- Socket.io client

**Backend:**
- Express.js
- Socket.io server
- Prisma ORM (PostgreSQL/SQLite)
- JWT authentication + session tracking
- Comprehensive security middleware

**Shared:**
- pnpm workspaces
- Shared types package
- Shared database package

### Key Features
- Real-time messaging with Socket.io
- End-to-end encryption for DMs
- RBAC (Role-Based Access Control)
- Multi-factor authentication (TOTP, backup codes)
- File uploads with S3 support
- Thread conversations, reactions, scheduled messages
- Dark mode with CSS variables
- Desktop (Electron) and Mobile (React Native) apps

---

## Architecture

### Monorepo Structure

```
PulseWeave/
├── apps/
│   ├── frontend/          # Next.js web app
│   ├── backend/           # Express API + Socket.io
│   ├── desktop/           # Electron app
│   └── mobile/            # React Native app
├── packages/
│   ├── types/             # Shared TypeScript types
│   └── database/          # Prisma schema & client
├── docs/                  # Documentation
├── deploy/                # Deployment configs
└── package.json           # Root workspace config
```

### Frontend Architecture (`apps/frontend/`)

```
apps/frontend/src/
├── app/                   # Next.js App Router pages
│   ├── login/
│   ├── register/
│   ├── admin/
│   ├── settings/
│   └── page.tsx           # Main chat interface
├── components/
│   ├── chat/              # Chat-related components
│   │   ├── ChatArea.tsx
│   │   ├── MessageList.tsx
│   │   ├── VirtualizedMessageList.tsx
│   │   ├── ThreadPanel.tsx
│   │   └── ...
│   ├── ui/                # Radix UI components
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   └── ...
│   └── settings/          # Settings components
├── hooks/                 # Custom React hooks
│   ├── useEncryption.ts
│   ├── usePermissions.ts
│   ├── useFormValidation.ts
│   └── ...
├── lib/                   # Utilities and services
│   ├── api.ts            # HTTP client (IMPORTANT!)
│   ├── socket.ts         # Socket.io client
│   ├── encryption.ts     # E2E encryption
│   └── utils.ts
├── store/                 # Zustand store
│   └── index.ts          # Global state management
└── config/
    └── env.ts            # Centralized env config
```

**Key Points:**
- **State Management**: Single Zustand store with persist middleware at `src/store/index.ts`
- **API Calls**: ALWAYS use `src/lib/api.ts` - see [API Conventions](#api-conventions)
- **Environment Variables**: ALWAYS import from `src/config/env.ts`, never use `process.env` directly
- **Path Alias**: `@/` maps to `src/`

### Backend Architecture (`apps/backend/`)

```
apps/backend/src/
├── index.ts               # Express app entry point
├── routes/                # API endpoints (17 files)
│   ├── auth.ts
│   ├── user.ts
│   ├── workspace.ts
│   ├── channel.ts
│   ├── message.ts
│   ├── dm.ts
│   └── ...
├── middleware/            # Express middleware
│   ├── auth.ts           # JWT validation + workspace context
│   ├── security.ts       # Request sanitization
│   ├── advanced-security.ts  # IP blocking, rate limiting
│   ├── rbac.ts           # Permission checks
│   ├── error-handler.ts  # Global error handling
│   └── ...
├── services/              # Business logic
│   ├── auth.ts
│   ├── encryption.ts
│   ├── mfa.ts
│   ├── rbac.ts
│   ├── email.ts
│   └── ...
├── config/
│   ├── environment.ts    # Zod-validated env schema
│   └── security.ts       # Security policies
├── socket/
│   └── index.ts          # Socket.io handlers
└── utils/
    ├── graceful-shutdown.ts
    ├── logger.ts
    └── ...
```

**Key Points:**
- **Authentication**: JWT with session tracking in database
- **Authorization**: RBAC system via `services/rbac.ts` and `middleware/rbac.ts`
- **Error Handling**: Custom `AppError` class with `statusCode`, `code`, `isOperational`
- **Logging**: Use `logger` from `utils/logger.ts`, NEVER `console.log`
- **Validation**: Zod schemas for all inputs

### Shared Packages

**`packages/types/`**: Shared TypeScript interfaces
- User, Workspace, Channel, Message, DirectMessage, Reaction, Attachment
- SocketEvent types (message:new, typing, presence, etc.)

**`packages/database/`**: Prisma client
- Single export: Prisma client singleton
- Scripts: generate, push, migrate, studio

---

## Codebase Structure

### Important Directories

| Path | Purpose |
|------|---------|
| `apps/frontend/src/app/` | Next.js pages (App Router) |
| `apps/frontend/src/components/` | React components |
| `apps/frontend/src/lib/api.ts` | **HTTP client (critical)** |
| `apps/frontend/src/store/index.ts` | Zustand global state |
| `apps/backend/src/routes/` | API endpoints |
| `apps/backend/src/middleware/` | Express middleware |
| `apps/backend/src/services/` | Business logic |
| `apps/backend/src/config/environment.ts` | Backend env config |
| `packages/database/prisma/schema.prisma` | Database schema |
| `docs/` | Project documentation |

### Configuration Files

| File | Purpose |
|------|---------|
| `pnpm-workspace.yaml` | Workspace configuration |
| `apps/frontend/next.config.mjs` | Next.js config |
| `apps/frontend/tsconfig.json` | Frontend TypeScript config |
| `apps/backend/tsconfig.json` | Backend TypeScript config |
| `apps/frontend/.eslintrc.json` | Frontend linting rules |
| `apps/backend/.eslintrc.json` | Backend linting rules |
| `apps/backend/.env` | Backend environment variables (gitignored) |

---

## Development Workflows

### Setup

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Start development servers
pnpm dev                  # Both frontend + backend
pnpm dev:frontend         # Frontend only (port 9797)
pnpm dev:backend          # Backend only (port 9090)
```

### Building

```bash
# Build everything
pnpm build

# Build specific app
pnpm build:frontend
pnpm build:backend
```

### Code Quality Checks

**ALWAYS run before committing:**

```bash
pnpm typecheck    # TypeScript validation
pnpm lint         # ESLint
pnpm build        # Full build test
```

### Database Operations

```bash
pnpm db:generate  # Generate Prisma client (after schema changes)
pnpm db:push      # Push schema to DB (development)
pnpm db:migrate   # Create migration (production)
pnpm db:studio    # Open Prisma Studio UI
```

### Testing

```bash
# Backend tests (Vitest)
cd apps/backend
pnpm test         # Run all tests
pnpm test:watch   # Watch mode
pnpm test:coverage # Coverage report
```

---

## Key Conventions

### API Conventions

**CRITICAL**: The frontend API layer automatically prepends `/api` to endpoints.

**✅ CORRECT Usage:**

```typescript
import { api } from '@/lib/api';

// Generic helpers (DO NOT include /api prefix)
await api.get('/users/me');           // → GET /api/users/me
await api.post('/friends/request', {}); // → POST /api/friends/request
await api.patch('/users/me', data);   // → PATCH /api/users/me
await api.delete('/friends/123');     // → DELETE /api/friends/123
```

**❌ WRONG Usage:**

```typescript
// This creates /api/api/friends (doubled prefix)
await api.get('/api/friends'); // ❌ NEVER DO THIS
```

**See**: `docs/API_CONVENTIONS.md` for full details.

### Environment Variables

**Frontend:**
```typescript
// ✅ CORRECT - Always use centralized config
import { API_URL } from '@/config/env';

// ❌ WRONG - Never use process.env directly
const url = process.env.NEXT_PUBLIC_API_URL;
```

**Backend:**
```typescript
// ✅ CORRECT - Use validated config
import { config } from '@/config/environment';
const port = config.PORT;

// ❌ WRONG - Direct access bypasses validation
const port = process.env.PORT;
```

### Import Patterns

**Frontend:**
```typescript
import { Button } from '@/components/ui/button';      // @ alias
import { useStore } from '@/store';
import { api } from '@/lib/api';
```

**Backend:**
```typescript
import { prisma } from '@pulseweave/database';        // Workspace package
import type { User } from '@pulseweave/types';
import { authenticate } from '@/middleware/auth';     // @ alias (backend)
```

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `message-list.tsx`, `auth-middleware.ts` |
| Components | PascalCase | `MessageList`, `ChatArea` |
| Functions | camelCase | `handleSubmit`, `getUserById` |
| Handlers | `handle*` prefix | `handleClick`, `handleSubmit` |
| Hooks | `use*` prefix | `usePermissions`, `useEncryption` |
| Types/Interfaces | PascalCase | `User`, `Workspace`, `MessageEvent` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE`, `API_URL` |

### Code Style

**Debugging:**
- ❌ **NO** `console.log` in production code (backend will error)
- ✅ Frontend: Use `console.error()`, `console.warn()`, `console.info()`
- ✅ Backend: Use `logger.info()`, `logger.error()`, `logger.warn()`

**TypeScript:**
- ✅ Strict mode enabled (both apps)
- ❌ Avoid `any` type - use proper typing or `unknown`
- ❌ NO `@ts-ignore` without descriptive comment (minimum 10 chars)

**Error Handling:**
```typescript
// Frontend
try {
  const data = await api.get('/users/me');
} catch (error) {
  console.error('Failed to load user:', error);
  // Handle error appropriately
}

// Backend
throw new AppError('User not found', 404, 'USER_NOT_FOUND');
```

### Authentication & Authorization

**Backend Middleware Pattern:**
```typescript
// routes/channel.ts
router.post(
  '/channels',
  authenticate,                    // Validates JWT + session
  requirePermission('MANAGE_CHANNELS'), // Checks RBAC permission
  async (req, res) => {
    const { userId, workspaceId } = req.user; // Available after auth
    // ...
  }
);
```

**Frontend API Pattern:**
```typescript
// Token automatically attached from Zustand store
const data = await api.get('/users/me');

// Workspace context automatically attached
const channels = await api.get('/channels'); // Uses current workspace
```

**Socket.io Authorization:**
```typescript
// Backend automatically validates:
// 1. JWT on connection
// 2. Session not revoked
// 3. User has workspace membership
// 4. User has channel access (for channel events)
```

---

## Security Guidelines

### Critical Security Rules

1. **NEVER commit secrets** - Use `.env` files (gitignored)
2. **NEVER use hardcoded credentials**
3. **ALWAYS validate user input** - Use Zod schemas
4. **ALWAYS check permissions** - Use RBAC middleware
5. **NEVER trust client data** - Validate on backend

### Pre-Production Checklist

See `docs/SECURITY_CHECKLIST.md` for full list:

- [ ] Change `JWT_SECRET` in `apps/backend/.env` (64+ chars)
- [ ] Change `COOKIE_SECRET` in `apps/backend/.env` (32+ chars)
- [ ] Set `SSL_ENABLED=true` or `BEHIND_PROXY=true`
- [ ] Review all environment variables
- [ ] Run `pnpm typecheck && pnpm lint && pnpm build`

### Generate Secure Secrets

```bash
# JWT Secret (64 chars)
openssl rand -base64 64

# Cookie Secret (32 chars)
openssl rand -base64 32
```

### Common Vulnerabilities to Avoid

1. **SQL Injection**: Use Prisma (parameterized queries)
2. **XSS**: Sanitize user input, use React (auto-escapes)
3. **Path Traversal**: Use `StorageService.getFileStream()` (sanitizes paths)
4. **CSRF**: SameSite cookies + CORS configuration
5. **Authentication Bypass**: Always use `authenticate` middleware
6. **Authorization Bypass**: Always check permissions with RBAC

---

## Common Tasks

### Adding a New API Endpoint

1. **Create route handler** in `apps/backend/src/routes/`
2. **Add middleware** (authentication, validation)
3. **Implement business logic** in `services/`
4. **Add Zod validation schema**
5. **Update frontend API client** in `apps/frontend/src/lib/api.ts` (optional)
6. **Test the endpoint**

Example:
```typescript
// apps/backend/src/routes/foo.ts
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, validate } from '@/middleware';

const router = Router();

const createFooSchema = z.object({
  name: z.string().min(1).max(100),
});

router.post(
  '/foo',
  authenticate,
  validate(createFooSchema),
  async (req, res, next) => {
    try {
      const { userId, workspaceId } = req.user;
      const { name } = req.body;

      // Business logic here
      const foo = await prisma.foo.create({
        data: { name, workspaceId, userId },
      });

      res.json(foo);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
```

### Adding a New Component

1. **Create component** in `apps/frontend/src/components/`
2. **Use TypeScript** with proper types
3. **Import from centralized config** (`@/config/env`, `@/lib/api`)
4. **Follow naming conventions** (PascalCase for component name)
5. **Use Radix UI** for base components when possible

### Adding a New Database Model

1. **Update schema** in `packages/database/prisma/schema.prisma`
2. **Generate client**: `pnpm db:generate`
3. **Create migration**: `pnpm db:migrate`
4. **Update types** in `packages/types/` if needed
5. **Add RBAC permissions** if model is workspace/channel-scoped

### Adding a Socket.io Event

**Backend** (`apps/backend/src/socket/index.ts`):
```typescript
socket.on('custom:event', async (data) => {
  // Validate permissions
  const hasAccess = await verifyChannelAccess(userId, data.channelId);
  if (!hasAccess) {
    return socket.emit('error', { message: 'Unauthorized' });
  }

  // Emit to channel
  io.to(`channel:${data.channelId}`).emit('custom:broadcast', data);
});
```

**Frontend** (`apps/frontend/src/lib/socket.ts`):
```typescript
socket.emit('custom:event', { channelId: '123', data: 'foo' });

socket.on('custom:broadcast', (data) => {
  // Handle broadcast
});
```

### Updating Environment Variables

1. **Update schema** in `apps/backend/src/config/environment.ts` (backend)
2. **Update schema** in `apps/frontend/src/config/env.ts` (frontend)
3. **Update `.env.example`** files
4. **Document in README.md**
5. **Restart dev servers**

---

## Testing

### Backend Testing (Vitest)

**Location**: `apps/backend/src/**/*.test.ts`

**Run tests**:
```bash
cd apps/backend
pnpm test           # All tests
pnpm test:watch     # Watch mode
pnpm test:coverage  # Coverage report
```

**Test Structure**:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ServiceName', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
    vi.clearAllMocks();
  });

  it('should do something', async () => {
    // Arrange
    const input = { foo: 'bar' };

    // Act
    const result = await service.doSomething(input);

    // Assert
    expect(result).toEqual({ success: true });
  });
});
```

**Coverage Targets**:
- Lines: 40%
- Functions: 65%
- Branches: 60%

### Frontend Testing

Currently no test framework configured. Consider adding:
- Vitest + React Testing Library
- Playwright for E2E tests

---

## Troubleshooting

### Build Errors

**"Cannot find module '@/...'"**
- Check `tsconfig.json` has `"@/*": ["./src/*"]` in paths
- Run `pnpm install` to ensure workspace links are set up

**"Prisma client not found"**
- Run `pnpm db:generate`
- Restart TypeScript server

**TypeScript errors after schema change**
- Run `pnpm db:generate`
- Run `pnpm build` to regenerate types

### Runtime Errors

**"401 Unauthorized" on API calls**
- Check token in Zustand store
- Verify `authenticate` middleware is working
- Check session not revoked in database

**"403 Forbidden" on API calls**
- Check user has required permission
- Verify RBAC middleware is applied
- Check workspace membership

**Socket.io not connecting**
- Check backend is running on port 9090
- Verify JWT token is valid
- Check CORS configuration

### Development Issues

**"Port already in use"**
```bash
# Kill process on port
npx kill-port 9090  # Backend
npx kill-port 9797  # Frontend
```

**"Database connection failed"**
- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Run `pnpm db:push` to create tables

**"CORS error"**
- Check `CORS_ORIGINS` in `apps/backend/.env`
- Ensure frontend URL is included
- Verify `NEXT_PUBLIC_API_URL` is correct

---

## Important Files Reference

### Must-Read Documentation

1. **`README.md`** - Quick start, project overview
2. **`docs/BEST_PRACTICES.md`** - Code quality standards
3. **`docs/API_CONVENTIONS.md`** - How to make API calls correctly
4. **`docs/SECURITY_CHECKLIST.md`** - Pre-production security tasks
5. **`PRODUCTION.md`** - Production deployment guide

### Critical Implementation Files

**Frontend:**
- `apps/frontend/src/lib/api.ts` - HTTP client (READ THIS FIRST)
- `apps/frontend/src/config/env.ts` - Environment variables
- `apps/frontend/src/store/index.ts` - Global state management
- `apps/frontend/src/lib/socket.ts` - Socket.io client

**Backend:**
- `apps/backend/src/index.ts` - Express app setup
- `apps/backend/src/config/environment.ts` - Environment config
- `apps/backend/src/middleware/auth.ts` - Authentication
- `apps/backend/src/middleware/rbac.ts` - Authorization
- `apps/backend/src/services/rbac.ts` - Permission definitions
- `apps/backend/src/socket/index.ts` - Socket.io handlers

**Database:**
- `packages/database/prisma/schema.prisma` - Database schema
- `packages/database/src/index.ts` - Prisma client export

---

## Quick Reference Commands

```bash
# Development
pnpm dev                  # Start both apps
pnpm dev:frontend         # Frontend only
pnpm dev:backend          # Backend only

# Building
pnpm build                # Build everything
pnpm typecheck            # TypeScript validation

# Code Quality
pnpm lint                 # Lint all
pnpm lint:frontend        # Lint frontend
pnpm lint:backend         # Lint backend

# Database
pnpm db:generate          # Generate Prisma client
pnpm db:push              # Push schema (dev)
pnpm db:migrate           # Create migration (prod)
pnpm db:studio            # Prisma Studio UI

# Desktop App
pnpm dev:desktop          # Run desktop app
pnpm build:desktop        # Build desktop app
pnpm build:desktop:all    # Build for all platforms

# Testing
cd apps/backend && pnpm test  # Run backend tests
```

---

## Getting Help

- **Documentation**: Check `docs/` directory
- **Issues**: Review existing issues in GitHub
- **Security**: See `docs/SECURITY_CHECKLIST.md`
- **API**: See `docs/API_CONVENTIONS.md`

---

## Notes for AI Assistants

### When Making Changes

1. **Read first**: Always read files before modifying
2. **Follow conventions**: Use existing patterns in the codebase
3. **Check docs**: Review relevant documentation files
4. **Run checks**: `pnpm typecheck && pnpm lint && pnpm build`
5. **Test changes**: Verify functionality works
6. **No over-engineering**: Keep it simple, avoid premature abstractions

### Common Pitfalls

1. **API calls**: Don't double `/api` prefix (see [API Conventions](#api-conventions))
2. **Environment vars**: Always use centralized config, never `process.env` directly
3. **Console.log**: Use proper logging (`logger` in backend, `console.error` in frontend)
4. **Secrets**: Never commit `.env` files or hardcode secrets
5. **Authorization**: Always check permissions, don't trust client data

### Best Practices

1. **Security first**: Always validate input, check permissions
2. **Type safety**: Use TypeScript properly, avoid `any`
3. **Error handling**: Use try/catch, custom error classes
4. **Code organization**: Follow existing file structure
5. **Documentation**: Update docs when making significant changes

---

**End of CLAUDE.md**
