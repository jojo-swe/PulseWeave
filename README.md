# PulseWeave

A modern, secure, and scalable team communication platform built with Next.js, Express, and Socket.io. PulseWeave ships as an open-source core (AGPLv3) with an optional commercial cloud offering.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Push schema to the dev database
pnpm db:push

# Start development servers (frontend + backend)
pnpm dev

# Frontend: http://localhost:9797
# Backend:  http://localhost:9090
```

## 📋 Prerequisites

- Node.js 20+
- pnpm 10+
- SQLite (default for dev) or PostgreSQL 14+ (production)

## 🏗️ Project Structure

```text
PulseWeave/
├── apps/
│   ├── frontend/          # Next.js 16 (Turbopack) — React 19, Tailwind, Zustand
│   ├── backend/           # Express + Socket.io — REST API & real-time layer
│   ├── desktop/           # Electron wrapper
│   └── mobile/            # React Native (placeholder)
├── packages/
│   ├── database/          # Prisma schema, migrations, seed
│   └── types/             # Shared TypeScript types
├── docs/                  # Extended documentation
└── marketing/             # Landing / marketing page
```

## 🎯 Features

### Messaging
- **Real-time channels** — public and private, with Socket.io
- **Direct messages** — 1-on-1 and group conversations
- **Threads** — reply to any message in-context
- **Message search** — full-text search with sanitized queries
- **Reactions** — emoji reactions on messages
- **Scheduled messages** — compose now, send later
- **File attachments** — images, documents, and media with S3-compatible storage
- **Rich text** — Markdown support in the editor

### Workspace Management
- **Multi-workspace** — create and switch between workspaces
- **Invite links** — generate links with optional expiry and usage limits; revoke at any time
- **Channel categories** — organize channels into collapsible groups
- **Starred channels** — pin frequently used channels to the top of the sidebar
- **Read receipts** — per-channel unread counts with real-time updates
- **Audit log** — track workspace-level actions

### Roles & Permissions
- **Granular RBAC** — Owner, Admin, Moderator, Member roles
- **Permission system** — fine-grained permissions mapped to roles
- **Member management** — promote, demote, remove, ban/unban users

### Authentication & Security
- **JWT authentication** with session management and token revocation
- **Multi-factor authentication** — TOTP and WebAuthn/Passkey support
- **Email verification** and password reset flows
- **Rate limiting** — per-route and global limits
- **Input sanitization** — SQL injection detection, HTML sanitization, search query cleaning
- **Helmet.js** security headers, CORS, CSRF protection
- **Secure cookies** — HttpOnly, SameSite, conditional Secure flag
- **Socket.io authorization** — workspace and channel membership enforced

### Integrations
- **Webhooks** — outgoing (event notifications) and incoming (external data)
- **API keys** — scoped keys for programmatic access
- **Pre-built connectors** — n8n, Zapier, Slack, Discord integration models
- **Push notifications** — Web Push subscription support

### User Experience
- **Presence indicators** — online, away, do-not-disturb, offline
- **Custom status** — set a status message visible to teammates
- **Typing indicators** — real-time, debounced
- **Dark mode** with theme toggle
- **Command palette** — Ctrl+K quick navigation
- **Keyboard shortcuts** — full shortcut reference panel
- **Responsive design** — mobile-friendly sidebar and bottom navigation
- **Friends system** — send/accept/reject friend requests

### Developer Experience
- **Health checks** — `/health`, `/health/live`, `/health/ready` for Kubernetes
- **Prometheus metrics** — `/metrics` endpoint
- **Structured logging** — JSON-based logger with levels
- **Graceful shutdown** — clean connection draining
- **Environment validation** — Zod-based config with production safety checks
- **Docker support** — `docker compose up` for containerized deployment

## 📚 Documentation

- **[Best Practices](docs/BEST_PRACTICES.md)** — Developer guidelines & standards
- **[API Conventions](docs/API_CONVENTIONS.md)** — How to make API calls correctly
- **[Security Checklist](docs/SECURITY_CHECKLIST.md)** — Pre-production security tasks
- **[Quick Wins](docs/QUICK_WINS.md)** — Improvement tracker
- **[Production Deployment](PRODUCTION.md)** — Production deployment + hardening guide
- **[SSL / TLS Setup](docs/SSL.md)** — HTTPS configuration for backend and frontend

## 🛠️ Development

### Available Scripts

```bash
# Development
pnpm dev                   # Start frontend + backend
pnpm dev:frontend          # Frontend only (port 9797)
pnpm dev:backend           # Backend only  (port 9090)
pnpm dev:desktop           # Electron app

# Building
pnpm build                 # Build all packages and apps
pnpm build:frontend        # Frontend only
pnpm build:backend         # Backend only
pnpm build:desktop         # Electron app

# Code Quality
pnpm lint                  # Lint frontend + backend
pnpm typecheck             # TypeScript validation (via build)

# Testing
pnpm --filter backend test          # Run backend tests (Vitest)
pnpm --filter backend test -- --run # Run once without watch

# Database
pnpm db:generate           # Generate Prisma client
pnpm db:push               # Push schema to dev database
pnpm db:migrate            # Run migrations (production)
pnpm db:studio             # Open Prisma Studio GUI

# Docker
pnpm docker:build          # Build containers
pnpm docker:up             # Start containers
pnpm docker:down           # Stop containers
pnpm docker:logs           # Tail logs
```

## 🏛️ Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (Turbopack), React 19, TypeScript, Tailwind CSS, Radix UI, Zustand, Socket.io Client |
| **Backend** | Express.js, Socket.io, TypeScript, Zod validation, Vitest |
| **Database** | Prisma ORM, SQLite (dev) / PostgreSQL (prod) |
| **Auth** | JWT with session store, TOTP, WebAuthn |
| **Security** | Helmet.js, express-rate-limit, CORS, CSRF, input sanitization |
| **Infra** | Docker Compose, health probes, Prometheus metrics, graceful shutdown |

### Data Model (key entities)

```text
User ─┬─ WorkspaceMember ── Workspace
      ├─ ChannelMember ──── Channel ── Message ── Reaction
      ├─ ConversationMember ── Conversation ── DirectMessage
      ├─ Session / WebAuthnCredential
      ├─ InviteLink
      ├─ Friendship
      └─ Subscription
```

### Real-Time Architecture

```text
Client (Socket.io) ──► Backend Socket Layer
                          ├─ Auth middleware (JWT + session validation)
                          ├─ Presence tracking (online/away/dnd/offline)
                          ├─ Channel message broadcast
                          ├─ DM message delivery
                          ├─ Typing indicators (debounced)
                          └─ Reaction sync
```

## 🔧 Environment Variables

Copy `.env.example` to `.env` in each app:

```bash
cp apps/backend/.env.example apps/backend/.env
```

**Required:**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Database connection string |
| `JWT_SECRET` | JWT signing secret (64+ chars) |
| `COOKIE_SECRET` | Cookie signing secret (32+ chars) |

**Optional:**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | API URL for frontend (omit for same-origin proxy) |
| `SSL_ENABLED` | Enable HTTPS (`true` / `false`) |
| `BEHIND_PROXY` | Trust proxy headers for secure cookies |
| `USE_DB_SESSIONS` | Database-backed sessions (`true` / `false`) |
| `STRIPE_SECRET_KEY` | Stripe billing integration |

Generate secure secrets:

```bash
openssl rand -base64 64  # JWT_SECRET
openssl rand -base64 32  # COOKIE_SECRET
```

See `.env.example` files for the complete list.

## 🔒 Security

### Hardening Completed

- ✅ Dependency vulnerabilities patched
- ✅ Authenticated file serving with path traversal protection
- ✅ Socket.io authorization for channels, workspaces, and reactions
- ✅ Secure cookies (HttpOnly, SameSite, conditional Secure)
- ✅ Rate limiting on auth and API routes
- ✅ Input sanitization (SQL injection detection, HTML cleaning, search query sanitization)
- ✅ Environment validation with production safety checks

### Before Deploying to Production

1. Set strong `JWT_SECRET` and `COOKIE_SECRET`
2. Set `SSL_ENABLED=true` or `BEHIND_PROXY=true`
3. Switch `DATABASE_URL` to PostgreSQL
4. Review [SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md)
5. Review [PRODUCTION.md](PRODUCTION.md)

## 🧪 Testing

The backend has a comprehensive test suite using **Vitest**:

```bash
pnpm --filter backend test -- --run
```

Coverage includes:
- Authentication middleware (JWT verification, session validation)
- Advanced security middleware (rate limiting, brute force protection)
- RBAC and permission enforcement
- Socket authentication and presence tracking
- Input validation and sanitization
- Health checks and graceful shutdown
- Environment configuration validation
- Encryption services
- Error handling

## 📖 Developer Guide

### Making API Calls

Always use the centralized config:

```typescript
import { API_URL } from '@/config/env';
```

See [API_CONVENTIONS.md](docs/API_CONVENTIONS.md) for details.

### Pre-Commit Checklist

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter backend test -- --run
```

See [BEST_PRACTICES.md](docs/BEST_PRACTICES.md) for the full checklist.

## 🤝 Contributing

1. Read [BEST_PRACTICES.md](docs/BEST_PRACTICES.md)
2. Create a feature branch
3. Make your changes
4. Run quality checks: `pnpm typecheck && pnpm lint && pnpm build`
5. Run tests: `pnpm --filter backend test -- --run`
6. Submit a pull request

## ⚠️ Disclaimer

**PulseWeave is free and open-source software provided "AS IS", without warranty of any kind. Use it entirely at your own risk.** The authors and contributors accept no responsibility or liability for any damages, data loss, security incidents, or other consequences arising from the use of this software. By using PulseWeave, you agree to the full terms in **[DISCLAIMER.md](DISCLAIMER.md)**.

## 📝 License

AGPL-3.0
