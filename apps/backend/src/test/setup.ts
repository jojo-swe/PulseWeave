import { vi, beforeAll, afterEach } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long-for-testing';
  process.env.COOKIE_SECRET = 'test-cookie-secret-at-least-32-chars';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.API_URL = 'http://localhost:9090';
  process.env.LDAP_ENABLED = 'true';
});

afterEach(() => {
  vi.clearAllMocks();
});
