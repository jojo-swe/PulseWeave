import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { userRouter } from './routes/user';
import { workspaceRouter } from './routes/workspace';
import { channelRouter } from './routes/channel';
import { messageRouter } from './routes/message';
import { dmRouter } from './routes/dm';
import uploadRouter from './routes/upload';
import path from 'path';
import { setupSocketHandlers } from './socket';
import { authenticateToken } from './middleware/auth';

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.startsWith('http://127.0.0.1:') || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Make io available to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/users', authenticateToken, userRouter);
app.use('/api/workspaces', authenticateToken, workspaceRouter);
app.use('/api/channels', authenticateToken, channelRouter);
app.use('/api/messages', authenticateToken, messageRouter);
app.use('/api/dm', authenticateToken, dmRouter);
app.use('/api/upload', uploadRouter);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Socket.io setup
setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 PulseWeave API running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket server ready`);
});

export { io };
