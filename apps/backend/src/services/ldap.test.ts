import { describe, expect, it, vi, beforeEach } from 'vitest';

// Set LDAP_ENABLED before any imports — vi.hoisted runs before module evaluation
vi.hoisted(() => {
  process.env.LDAP_ENABLED = 'true';
});

// Shared mock client methods that tests can control — must be hoisted so vi.mock factory can access it
const mockClient = vi.hoisted(() => ({
  bind: vi.fn(),
  unbind: vi.fn(),
  search: vi.fn(),
}));

vi.mock('ldapts', () => ({
  Client: vi.fn().mockImplementation(() => mockClient),
}));

vi.mock('@pulseweave/database', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workspace: {
      findFirst: vi.fn(),
    },
    workspaceMember: {
      create: vi.fn(),
    },
    channel: {
      findFirst: vi.fn(),
    },
    channelMember: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { prisma } from '@pulseweave/database';
import {
  isLdapEnabled,
  getLdapConfig,
  authenticateLdap,
  isLdapAdmin,
  syncLdapUser,
  testLdapConnection,
  searchLdapUsers,
} from './ldap';

describe('ldap service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.bind.mockReturnValue(undefined);
    mockClient.unbind.mockReturnValue(undefined);
    mockClient.search.mockReturnValue({ searchEntries: [] });
  });

  describe('isLdapEnabled', () => {
    it('should return true when LDAP_ENABLED is set', () => {
      expect(isLdapEnabled()).toBe(true);
    });
  });

  describe('getLdapConfig', () => {
    it('should return safe config object', () => {
      const config = getLdapConfig();
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('url');
      expect(config).toHaveProperty('searchBase');
      expect(config).not.toHaveProperty('bindPassword');
    });
  });

  describe('authenticateLdap', () => {
    it('should authenticate user successfully', async () => {
      mockClient.search.mockResolvedValue({
        searchEntries: [{
          dn: 'cn=user,dc=example,dc=com',
          uid: 'testuser',
          mail: 'test@example.com',
          cn: 'Test User',
        }],
      });

      const result = await authenticateLdap('testuser', 'password123');

      expect(result).not.toBeNull();
      expect(result!.username).toBe('testuser');
      expect(result!.email).toBe('test@example.com');
      expect(result!.displayName).toBe('Test User');
      expect(result!.dn).toBe('cn=user,dc=example,dc=com');
    });

    it('should return null if user not found', async () => {
      mockClient.search.mockResolvedValue({ searchEntries: [] });

      const result = await authenticateLdap('nonexistent', 'password');

      expect(result).toBeNull();
    });

    it('should return null if user bind fails (wrong password)', async () => {
      let bindCallCount = 0;
      mockClient.bind.mockImplementation(() => {
        bindCallCount++;
        if (bindCallCount === 2) {
          return Promise.reject(new Error('Invalid credentials'));
        }
        return Promise.resolve();
      });
      mockClient.search.mockResolvedValue({
        searchEntries: [{
          dn: 'cn=user,dc=example,dc=com',
          uid: 'testuser',
          mail: 'test@example.com',
          cn: 'Test User',
        }],
      });

      const result = await authenticateLdap('testuser', 'wrongpassword');

      expect(result).toBeNull();
    });

    it('should throw on LDAP connection errors', async () => {
      mockClient.bind.mockRejectedValue(new Error('Connection refused'));

      await expect(authenticateLdap('testuser', 'password')).rejects.toThrow(
        'LDAP authentication failed'
      );
    });

    it('should use fallback values for missing attributes', async () => {
      mockClient.search.mockResolvedValue({
        searchEntries: [{
          dn: 'cn=user,dc=example,dc=com',
        }],
      });

      const result = await authenticateLdap('testuser', 'password');

      expect(result).not.toBeNull();
      expect(result!.username).toBe('testuser');
      expect(result!.email).toBe('testuser@ldap.local');
      expect(result!.displayName).toBe('testuser');
    });
  });

  describe('isLdapAdmin', () => {
    it('should return true if user is in admin group', () => {
      expect(isLdapAdmin(['cn=admins,ou=groups,dc=example,dc=com'])).toBe(true);
    });

    it('should return false if user is not in admin group', () => {
      expect(isLdapAdmin(['cn=users,ou=groups,dc=example,dc=com'])).toBe(false);
    });

    it('should return false for empty groups', () => {
      expect(isLdapAdmin([])).toBe(false);
    });
  });

  describe('syncLdapUser', () => {
    it('should update existing user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'user-1',
        email: 'old@example.com',
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'user-1',
        email: 'new@example.com',
        displayName: 'New Name',
      } as never);

      const result = await syncLdapUser({
        dn: 'cn=user,dc=example,dc=com',
        username: 'testuser',
        email: 'new@example.com',
        displayName: 'New Name',
      });

      expect(result.id).toBe('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            email: 'new@example.com',
            displayName: 'New Name',
            isVerified: true,
          }),
        })
      );
    });

    it('should create new user and join default workspace', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'new-user-1',
        email: 'test@example.com',
      } as never);
      vi.mocked(prisma.workspace.findFirst).mockResolvedValue({
        id: 'ws-1',
      } as never);
      vi.mocked(prisma.workspaceMember.create).mockResolvedValue({} as never);
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({
        id: 'ch-general',
      } as never);
      vi.mocked(prisma.channelMember.create).mockResolvedValue({} as never);

      const result = await syncLdapUser({
        dn: 'cn=user,dc=example,dc=com',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
      });

      expect(result.id).toBe('new-user-1');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com',
            username: 'testuser',
            isVerified: true,
            passwordHash: '',
          }),
        })
      );
      expect(prisma.workspaceMember.create).toHaveBeenCalled();
      expect(prisma.channelMember.create).toHaveBeenCalled();
    });

    it('should assign admin role when user is in admin group', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'new-user-1',
      } as never);
      vi.mocked(prisma.workspace.findFirst).mockResolvedValue({
        id: 'ws-1',
      } as never);
      vi.mocked(prisma.workspaceMember.create).mockResolvedValue({} as never);
      vi.mocked(prisma.channel.findFirst).mockResolvedValue(null);

      await syncLdapUser({
        dn: 'cn=admin,dc=example,dc=com',
        username: 'admin',
        email: 'admin@example.com',
        displayName: 'Admin User',
        groups: ['cn=admins,ou=groups,dc=example,dc=com'],
      });

      expect(prisma.workspaceMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            roleName: 'admin',
          }),
        })
      );
    });

    it('should create user without workspace if no default workspace exists', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'new-user-1',
      } as never);
      vi.mocked(prisma.workspace.findFirst).mockResolvedValue(null);

      const result = await syncLdapUser({
        dn: 'cn=user,dc=example,dc=com',
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
      });

      expect(result.id).toBe('new-user-1');
      expect(prisma.workspaceMember.create).not.toHaveBeenCalled();
    });
  });

  describe('testLdapConnection', () => {
    it('should return success when connection works', async () => {
      mockClient.search.mockResolvedValue({ searchEntries: [{ dn: 'dc=example,dc=com' }] });

      const result = await testLdapConnection();

      expect(result.success).toBe(true);
      expect(result.details).toBeDefined();
      expect(result.details!.url).toBeDefined();
      expect(result.details!.bindDN).toBeDefined();
      expect(result.details!.searchBase).toBeDefined();
    });

    it('should return error on connection failure', async () => {
      mockClient.bind.mockRejectedValue(new Error('Connection refused'));

      const result = await testLdapConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('searchLdapUsers', () => {
    it('should search and return matching users', async () => {
      mockClient.search.mockResolvedValue({
        searchEntries: [
          {
            dn: 'cn=user1,dc=example,dc=com',
            uid: 'user1',
            mail: 'user1@example.com',
            cn: 'User One',
          },
          {
            dn: 'cn=user2,dc=example,dc=com',
            uid: 'user2',
            mail: 'user2@example.com',
            cn: 'User Two',
          },
        ],
      });

      const result = await searchLdapUsers('user');

      expect(result).toHaveLength(2);
      expect(result[0]!.username).toBe('user1');
      expect(result[1]!.username).toBe('user2');
    });

    it('should return empty array on search error', async () => {
      mockClient.bind.mockRejectedValue(new Error('Connection error'));

      const result = await searchLdapUsers('test');

      expect(result).toEqual([]);
    });
  });
});
