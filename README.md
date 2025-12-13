# PulseWeave

A modern, secure, and scalable team communication platform built with Next.js, Express, and Socket.io.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Start development servers (frontend + backend)
pnpm dev

# Frontend: http://localhost:9797
# Backend: http://localhost:9090
```

## 📋 Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL 14+

## 🏗️ Project Structure

```text
PulseWeave/
├── apps/
│   ├── frontend/          # Next.js 16 (Turbopack)
│   ├── backend/           # Express + Socket.io
│   ├── desktop/           # Electron app
│   └── mobile/            # React Native
├── packages/
│   ├── database/          # Prisma schema & migrations
│   └── types/             # Shared TypeScript types
└── docs/                  # Documentation
```

## 📚 Documentation

- **[Best Practices](docs/BEST_PRACTICES.md)** - Developer guidelines & standards
- **[API Conventions](docs/API_CONVENTIONS.md)** - How to make API calls correctly
- **[Security Checklist](docs/SECURITY_CHECKLIST.md)** - Pre-production security tasks
- **[Quick Wins](docs/QUICK_WINS.md)** - Improvement tracker
- **[Production Deployment](PRODUCTION.md)** - Production deployment + hardening guide
- **[SSL / TLS Setup](docs/SSL.md)** - HTTPS configuration for backend and frontend

## 🛠️ Development

### Available Scripts

```bash
# Development
pnpm dev                   # Start all services
pnpm dev:frontend          # Frontend only
pnpm dev:backend           # Backend only

# Building
pnpm build                 # Build all
pnpm typecheck             # TypeScript validation

# Code Quality
pnpm lint                  # Lint frontend + backend
pnpm lint:frontend         # Lint frontend only
pnpm lint:backend          # Lint backend only

# Database
pnpm db:generate           # Generate Prisma client
pnpm db:push               # Push schema changes
pnpm db:migrate            # Run migrations
pnpm db:studio             # Open Prisma Studio
```

## 🔒 Security

### Security Hardening Completed

- ✅ **Dependency vulnerabilities** patched (Next.js, semver, ip)
- ✅ **Authenticated file serving** - uploads require valid session
- ✅ **Path traversal protection** - file paths sanitized
- ✅ **Socket.io authorization** - channel/workspace membership enforced for messages and reactions
- ✅ **Secure cookies** - HttpOnly, SameSite, conditional Secure flag

### Before Deploying to Production

1. Change `JWT_SECRET` in `apps/backend/.env`
2. Change `COOKIE_SECRET` in `apps/backend/.env`
3. Set `SSL_ENABLED=true` or `BEHIND_PROXY=true` for secure cookies
4. Review `docs/SECURITY_CHECKLIST.md`

See detailed security requirements in [SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md).

## 🧪 Code Quality

This project enforces:

- ✅ **TypeScript strict mode** (frontend & backend)
- ✅ **ESLint** with recommended rules
- ✅ **No console.log** in production code
- ✅ **Centralized environment config**

Run checks before committing:

```bash
pnpm typecheck && pnpm lint && pnpm build
```

## 🎯 Key Features

- **Real-time messaging** with Socket.io
- **End-to-end encryption** for DMs
- **Advanced role management** (Owner, Admin, Moderator, Member)
- **Multi-factor authentication** (TOTP, WebAuthn)
- **Rich text editor** with markdown support
- **Thread conversations**
- **File uploads** with S3 support
- **Push notifications**
- **Dark mode** with multiple themes

## 🔧 Environment Variables

Copy `.env.example` to `.env` in each app:

```bash
# Backend
cp apps/backend/.env.example apps/backend/.env

# Generate secure secrets
openssl rand -base64 64  # JWT_SECRET
openssl rand -base64 32  # COOKIE_SECRET
```

Required variables:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret (64+ chars)
- `COOKIE_SECRET` - Cookie signing secret (32+ chars)
- `NEXT_PUBLIC_API_URL` - API endpoint for frontend

See `.env.example` files for complete list.

## 🏛️ Architecture

### Tech Stack

**Frontend:**

- Next.js 16 with Turbopack
- React 19
- TypeScript
- Tailwind CSS
- Radix UI components
- Zustand for state management

**Backend:**

- Express.js
- Socket.io
- Prisma ORM
- PostgreSQL
- JWT authentication
- Redis (optional, for sessions)

**Security:**

- Helmet.js for security headers
- Rate limiting with express-rate-limit
- Input sanitization
- CORS protection
- CSRF protection

## 📖 Developer Guide

### Making API Calls

**Always use the centralized config:**

```typescript
// Correct
import { API_URL } from '@/config/env';

// Wrong - don't duplicate process.env calls
const API_URL = process.env.NEXT_PUBLIC_API_URL || '...';
```

See [API_CONVENTIONS.md](docs/API_CONVENTIONS.md) for details.

### Pre-Commit Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` succeeds
- [ ] No `console.log` statements
- [ ] No hardcoded secrets
- [ ] Tests pass (when available)

See [BEST_PRACTICES.md](docs/BEST_PRACTICES.md) for full checklist.

## 🤝 Contributing

1. Read [BEST_PRACTICES.md](docs/BEST_PRACTICES.md)
2. Create a feature branch
3. Make your changes
4. Run quality checks: `pnpm typecheck && pnpm lint && pnpm build`
5. Submit a pull request

## 📝 License

AGPL-3.0

## 🙏 Acknowledgments

Built with modern best practices prioritizing:

1. **Security** - Secure by default
2. **Robustness** - Type-safe and tested
3. **Scalability** - Built to grow
4. **UX** - Fast and intuitive
5. **Features** - Rich functionality
