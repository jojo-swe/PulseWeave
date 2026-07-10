import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    subscription: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

const stripeMock = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
}));
vi.mock('stripe', () => ({
  default: vi.fn(() => stripeMock),
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { userId: string }).userId = 'test-user-id';
    next();
  },
  AuthRequest: class AuthRequest {},
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@pulseweave/database';
import paymentsRouter from './payments';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/payments', paymentsRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof Error) {
      const status = (err as Error & { statusCode?: number }).statusCode ?? 500;
      res.status(status).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  });
  return app;
}

describe('payments routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  describe('POST /payments/create-checkout-session', () => {
    it('should create a checkout session', async () => {
      stripeMock.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_123' });

      const res = await request(createApp())
        .post('/payments/create-checkout-session')
        .send({ priceId: 'price_pro_monthly' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('cs_test_123');
    });

    it('should return 500 if Stripe not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY;

      // Need to re-import to reset stripeChecked singleton
      vi.resetModules();
      vi.doMock('@pulseweave/database', () => ({ prisma }));
      vi.doMock('stripe', () => ({ default: vi.fn(() => stripeMock) }));
      vi.doMock('../middleware/auth', () => ({
        authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
          (req as unknown as { userId: string }).userId = 'test-user-id';
          next();
        },
        AuthRequest: class AuthRequest {},
      }));
      vi.doMock('../utils/logger', () => ({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      }));

      const { default: freshRouter } = await import('./payments');
      const app = express();
      app.use(express.json());
      app.use('/payments', freshRouter);
      app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        if (err instanceof Error) {
          const status = (err as Error & { statusCode?: number }).statusCode ?? 500;
          res.status(status).json({ error: err.message });
        } else {
          res.status(500).json({ error: 'Unknown error' });
        }
      });

      const res = await request(app)
        .post('/payments/create-checkout-session')
        .send({ priceId: 'price_pro_monthly' });

      expect(res.status).toBe(500);

      // Restore env
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    });
  });

  describe('POST /payments/webhook', () => {
    it('should process checkout.session.completed event', async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { userId: 'u1' },
            customer: 'cus_123',
            subscription: 'sub_123',
          },
        },
      });
      vi.mocked(prisma.subscription.upsert).mockResolvedValue({} as never);

      const res = await request(createApp())
        .post('/payments/webhook')
        .set('stripe-signature', 'sig_123')
        .send({ type: 'checkout.session.completed' });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('should process customer.subscription.deleted event', async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_123' } },
      });
      vi.mocked(prisma.subscription.updateMany).mockResolvedValue({ count: 1 } as never);

      const res = await request(createApp())
        .post('/payments/webhook')
        .set('stripe-signature', 'sig_123')
        .send({});

      expect(res.status).toBe(200);
    });

    it('should return 400 if missing stripe-signature header', async () => {
      const res = await request(createApp())
        .post('/payments/webhook')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid webhook signature', async () => {
      stripeMock.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const res = await request(createApp())
        .post('/payments/webhook')
        .set('stripe-signature', 'bad_sig')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /payments/subscription', () => {
    it('should return subscription status', async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        status: 'active', plan: 'pro',
        currentPeriodStart: new Date(), currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
      } as never);

      const res = await request(createApp()).get('/payments/subscription');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
      expect(res.body.plan).toBe('pro');
    });

    it('should return free plan if no subscription', async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).get('/payments/subscription');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('inactive');
      expect(res.body.plan).toBe('free');
    });
  });

  describe('POST /payments/create-portal-session', () => {
    it('should create a billing portal session', async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        stripeCustomerId: 'cus_123',
      } as never);
      stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: 'https://billing.stripe.com/portal' });

      const res = await request(createApp()).post('/payments/create-portal-session');

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://billing.stripe.com/portal');
    });

    it('should return 400 if no subscription found', async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);

      const res = await request(createApp()).post('/payments/create-portal-session');

      expect(res.status).toBe(400);
    });
  });
});
