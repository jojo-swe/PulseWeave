import { vi } from 'vitest';

type ModelMock = {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  aggregate: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
};

type PrismaMock = Record<string, ModelMock | ReturnType<typeof vi.fn>>;

function createModelMock(): ModelMock {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

/**
 * Creates a comprehensive Prisma mock with all commonly used models.
 * Each model has standard CRUD methods as vi.fn() that return resolved promises.
 *
 * Usage in test files:
 *   vi.mock('@pulseweave/database', () => ({ prisma: createPrismaMock() }));
 *
 * Then in tests, access mocks via:
 *   const { prisma } = require('@pulseweave/database');
 *   vi.mocked(prisma.user.findUnique).mockResolvedValue({ ... });
 */
export function createPrismaMock(): PrismaMock {
  const models = [
    'user', 'workspace', 'workspaceMember', 'channel', 'channelMember',
    'message', 'directMessage', 'session', 'apiKey', 'webhook', 'incomingWebhook',
    'webhookDelivery', 'auditLog', 'userPreferences', 'friendship', 'notification',
    'attachment', 'reaction', 'scheduledMessage', 'category', 'integration',
    'emailVerificationToken', 'passwordResetToken', 'mfaCredential', 'blockedIp',
    'subscription',
  ];

  const prisma: PrismaMock = {};
  for (const model of models) {
    prisma[model] = createModelMock();
  }

  prisma.$transaction = vi.fn((fn: unknown) => {
    if (typeof fn === 'function') return fn(createPrismaMock());
    return Promise.resolve(fn);
  });
  prisma.$queryRaw = vi.fn();
  prisma.$queryRawUnsafe = vi.fn();
  prisma.$executeRaw = vi.fn();
  prisma.$executeRawUnsafe = vi.fn();

  return prisma;
}
