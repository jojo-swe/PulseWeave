# PulseWeave - Modern Team Communication

A modern, real-time team communication platform built as a Slack alternative. Features a beautiful dark UI, real-time messaging, emoji reactions, and more.

![PulseWeave](https://via.placeholder.com/800x400?text=Chatterbox+Screenshot)

## Features

- **Real-time Messaging** - Instant message delivery with Socket.io
- **Channels** - Organize conversations by topic
- **Emoji Reactions** - React to messages with emojis
- **Typing Indicators** - See when others are typing
- **User Presence** - Online/offline status for team members
- **Modern UI** - Beautiful dark theme with smooth animations
- **Responsive Design** - Works on desktop and mobile

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
- **SQLite** - Database (easily swap to PostgreSQL)
- **JWT** - Authentication

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd PulseWeave
   pnpm install
   ```

2. **Set up the database:**
   ```bash
   # Copy the example env file
   cp packages/database/.env.example packages/database/.env
   
   # Generate Prisma client and push schema
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

## Project Structure

```
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
PORT=3001
JWT_SECRET=your-secret-key
FRONTEND_URL=http://localhost:3000
```

### Database (`packages/database/.env`)
```env
DATABASE_URL="file:./dev.db"
```

### Frontend (`apps/frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `GET /api/auth/me` - Get current user

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

MIT
