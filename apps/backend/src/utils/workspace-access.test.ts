import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pulseweave/database', () => ({
  prisma: {
    workspaceMember: {
      findUnique: vi.fn(),
    },
    workspace: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@pulseweave/database';
import { hasAdminAccess, isWorkspaceMember } from './workspace-access';

type PrismaMock = {
  workspaceMember: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  workspace: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

describe('utils/workspace-access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hasAdminAccess returns true when user is workspace owner', async () => {
    const prismaMock = prisma as unknown as PrismaMock;

    prismaMock.workspaceMember.findUnique.mockResolvedValueOnce({ roleName: 'member' });
    prismaMock.workspace.findUnique.mockResolvedValueOnce({ ownerId: 'u1' });

    await expect(hasAdminAccess('u1', 'w1')).resolves.toBe(true);
  });

  it('hasAdminAccess returns true when membership role is admin', async () => {
    const prismaMock = prisma as unknown as PrismaMock;

    prismaMock.workspaceMember.findUnique.mockResolvedValueOnce({ roleName: 'admin' });
    prismaMock.workspace.findUnique.mockResolvedValueOnce({ ownerId: 'someone-else' });

    await expect(hasAdminAccess('u1', 'w1')).resolves.toBe(true);
  });

  it('hasAdminAccess returns false when not owner and not admin/owner role', async () => {
    const prismaMock = prisma as unknown as PrismaMock;

    prismaMock.workspaceMember.findUnique.mockResolvedValueOnce({ roleName: 'member' });
    prismaMock.workspace.findUnique.mockResolvedValueOnce({ ownerId: 'someone-else' });

    await expect(hasAdminAccess('u1', 'w1')).resolves.toBe(false);
  });

  it('isWorkspaceMember returns true when membership exists', async () => {
    const prismaMock = prisma as unknown as PrismaMock;

    prismaMock.workspaceMember.findUnique.mockResolvedValueOnce({ roleName: 'member' });

    await expect(isWorkspaceMember('u1', 'w1')).resolves.toBe(true);
  });

  it('isWorkspaceMember returns false when membership is missing', async () => {
    const prismaMock = prisma as unknown as PrismaMock;

    prismaMock.workspaceMember.findUnique.mockResolvedValueOnce(null);

    await expect(isWorkspaceMember('u1', 'w1')).resolves.toBe(false);
  });
});
