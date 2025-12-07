# PulseWeave - Modern Team Communication

A modern, real-time team communication platform built as a Slack alternative. Features a beautiful dark UI, real-time messaging, emoji reactions, and more.

![PulseWeave](./apps/frontend/public/assets/hero-mockup.png)

## Features

- **Real-time Messaging** - Instant delivery with Socket.io
- **Channels & DMs** - Organize conversations by topic or 1:1
- **RBAC & Admin Panel** - Roles, permissions, audit log, user management
- **MFA (TOTP + WebAuthn)** - Authenticator apps, YubiKey/Passkeys, backup codes
- **LDAP / SSO** - Directory-based login with auto-sync
- **Advanced Security** - Rate limiting, IP blocking, account lockout, HSTS, CSRF readiness, security dashboard
- **Emoji Reactions & Typing Indicators** - Expressive, real-time UX
- **User Presence** - Online/away/busy/offline with quick status picker
- **Modern UI** - Dark theme, responsive, mobile-friendly

## Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TailwindCSS** - Utility-first CSS
- **Radix UI** - Accessible component primitives
- **Zustand** - Lightweight state management
- **Socket.io Client** - Real-time communication

### Backend
- **Node.js + Express** - API server
- **Socket.io** - WebSocket server
- **Prisma** - Type-safe ORM
- **SQLite / PostgreSQL** - Database (SQLite default, PostgreSQL for scaling)
- **JWT** - Authentication

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm - (winget install -e --id pnpm.pnpm)

### Installation

1. **Clone and install dependencies:**

   ```bash
   cd PulseWeave
   pnpm install
   ```

2. **Set up the database:**

   ```bash
   # Backend env
   cp apps/backend/.env.example apps/backend/.env

   # Database env (Prisma)
   cp packages/database/.env.example packages/database/.env
   
   pnpm db:generate
   pnpm db:push
   ```

3. **Start the development servers:**

   ```bash
   pnpm dev
   ```

   This starts both:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001

### First Time Setup

1. Open http://localhost:3000
2. Click "Sign up" to create an account
3. A default workspace and #general channel will be created
4. Start chatting!

### How the first admin user is created

- The **first account you register** automatically becomes **workspace owner** and gets the **owner/admin role** for the default workspace.
- Owners can create additional workspaces, assign roles, and access the Admin Panel and Security Dashboard.
- To invite more admins later, use the Admin Panel → Users tab and change their role to **admin** or **owner** (if allowed by your policy).

## Troubleshooting

- **P2025 / Record to update not found (sockets)**: This happens when the browser holds a stale JWT pointing to a deleted user (e.g., after wiping the DB). Fix by logging out/clearing storage and logging in again. The server also disconnects sockets when the user record is missing.
- **Prisma client errors**: Ensure `packages/database/.env` matches your local DB path and run `pnpm db:push`.
- **Next.js env issues**: Restart the frontend dev server after changing `.env.local`.

## Project Structure

```text
PulseWeave/
├── apps/
│   ├── backend/          # Express + Socket.io API
│   │   └── src/
│   │       ├── routes/   # REST API routes
│   │       ├── socket/   # WebSocket handlers
│   │       └── middleware/
│   └── frontend/         # Next.js app
│       └── src/
│           ├── app/      # Pages (App Router)
│           ├── components/
│           ├── lib/      # Utilities
│           └── store/    # Zustand store
├── packages/
│   ├── database/         # Prisma schema & client
│   └── types/            # Shared TypeScript types
└── package.json          # Workspace root
```

> SSL/TLS setup guide: see `docs/SSL.md`.

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers |
| `pnpm dev:frontend` | Start frontend only |
| `pnpm dev:backend` | Start backend only |
| `pnpm build` | Build all packages |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema to database |
| `pnpm db:studio` | Open Prisma Studio |

## Environment Variables

### Backend (`apps/backend/.env`)
```env
# Core
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# JWT
JWT_SECRET=change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# SSL/TLS
SSL_ENABLED=false
SSL_KEY_PATH=./certs/server.key
SSL_CERT_PATH=./certs/server.crt
SSL_CA_PATH=./certs/ca.crt
SSL_PORT=3443
SSL_HTTP_REDIRECT=true
SSL_MIN_VERSION=TLSv1.2

# Cookies
COOKIE_SECRET=change-this-cookie-secret

# Security (lockout & IP blocking)
ACCOUNT_MAX_FAILED_ATTEMPTS=5
ACCOUNT_LOCKOUT_DURATION_MINUTES=15
LOCKOUT_PROGRESSIVE_MULTIPLIER=2
MAX_FAILED_ATTEMPTS=10
IP_BLOCK_DURATION_MINUTES=30
ATTEMPT_WINDOW_MINUTES=15

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=10

# LDAP (optional)
LDAP_ENABLED=false
LDAP_URL=ldap://localhost:389
LDAP_BIND_DN=cn=admin,dc=example,dc=com
LDAP_BIND_PASSWORD=your-bind-password
LDAP_SEARCH_BASE=dc=example,dc=com
LDAP_SEARCH_FILTER=(uid={{username}})
LDAP_USERNAME_ATTR=uid
LDAP_EMAIL_ATTR=mail
LDAP_DISPLAY_NAME_ATTR=cn
LDAP_GROUP_SEARCH_BASE=ou=groups,dc=example,dc=com
LDAP_GROUP_SEARCH_FILTER=(member={{dn}})
LDAP_ADMIN_GROUP=cn=admins,ou=groups,dc=example,dc=com
```

### Database (`packages/database/.env`)

```env
# SQLite (default - works great for small teams)
DATABASE_URL="file:./dev.db"

# PostgreSQL (for scaling 100+ users)
# DATABASE_URL="postgresql://user:password@localhost:5432/pulseweave?schema=public"
```

> **Scaling Note:** SQLite works well for teams up to ~100 users. For larger deployments or horizontal scaling, switch to PostgreSQL. See `packages/database/.env.example` for instructions.

### Frontend (`apps/frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account (local)
- `POST /api/auth/login` - Sign in (local, MFA-aware)
- `POST /api/auth/ldap/login` - Sign in with LDAP
- `GET /api/auth/config` - Auth capability flags (LDAP enabled?)
- `GET /api/auth/me` - Get current user

### MFA
- `POST /api/mfa/totp/setup` - Generate TOTP secret + QR
- `POST /api/mfa/totp/enable` - Verify + enable TOTP
- `POST /api/mfa/totp/disable` - Disable TOTP (password required)
- `POST /api/mfa/webauthn/register/options` - WebAuthn registration options
- `POST /api/mfa/webauthn/register/verify` - Complete WebAuthn registration
- `POST /api/mfa/webauthn/authenticate/options` - WebAuthn auth options
- `POST /api/mfa/webauthn/authenticate/verify` - Complete WebAuthn auth
- `GET /api/mfa/webauthn/credentials` - List credentials
- `DELETE /api/mfa/webauthn/credentials/:id` - Remove credential

### Workspaces
- `GET /api/workspaces` - List user's workspaces
- `GET /api/workspaces/:id` - Get workspace details
- `POST /api/workspaces` - Create workspace

### Channels
- `GET /api/channels/:id` - Get channel details
- `POST /api/channels` - Create channel
- `POST /api/channels/:id/join` - Join channel

### Messages
- `GET /api/messages/channel/:channelId` - Get messages
- `POST /api/messages` - Send message
- `PATCH /api/messages/:id` - Edit message
- `DELETE /api/messages/:id` - Delete message
- `POST /api/messages/:id/reactions` - Add reaction

### Admin & Security
- `GET /api/admin/workspaces/:id/users` - List users with roles
- `PATCH /api/admin/workspaces/:id/users/:userId/role` - Change user role
- `POST /api/admin/workspaces/:id/users/:userId/ban` - Ban user
- `POST /api/admin/workspaces/:id/users/:userId/unban` - Unban user
- `GET /api/admin/workspaces/:id/audit-log` - Audit log
- `GET /api/security/status` - Security status (SSL, failed logins, MFA adoption)
- `GET /api/security/locked-accounts` - Locked/disabled accounts
- `POST /api/security/unlock-account/:userId` - Unlock account
- `POST /api/security/block-ip` - Block an IP
- `GET /api/security/check-ip/:ip` - Check IP block status

## WebSocket Events

### Client → Server
- `workspace:join` - Join workspace room
- `channel:join` - Join channel room
- `channel:leave` - Leave channel room
- `message:send` - Send message
- `typing:start` - Start typing indicator
- `typing:stop` - Stop typing indicator
- `reaction:add` - Add reaction
- `reaction:remove` - Remove reaction

### Server → Client
- `message:new` - New message received
- `message:reaction` - Reaction added/removed
- `user:typing` - User started typing
- `user:typing:stop` - User stopped typing
- `user:status` - User status changed

## License

GNU GPLv3
