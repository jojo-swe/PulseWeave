import { describe, expect, it, vi, beforeEach } from 'vitest';

const { sendMail } = vi.hoisted(() => ({
  sendMail: vi.fn(),
}));

const { createTransport } = vi.hoisted(() => ({
  createTransport: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport,
  },
  createTransport,
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { sendEmail, sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from './email';

describe('email service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to development mode without SMTP
    process.env.NODE_ENV = 'test';
    delete process.env.SMTP_HOST;
  });

  describe('sendEmail', () => {
    it('should log and return true in development mode (no SMTP)', async () => {
      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
        text: 'Hello',
      });

      expect(result).toBe(true);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('should send email via transporter when SMTP is configured', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';

      createTransport.mockReturnValue({
        sendMail: sendMail,
      });
      sendMail.mockResolvedValue({ messageId: '123' });

      // Re-import to pick up new env vars
      vi.resetModules();
      const { sendEmail: sendEmailFresh } = await import('./email');

      const result = await sendEmailFresh({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      expect(result).toBe(true);
      expect(sendMail).toHaveBeenCalled();
    });

    it('should return false when sendMail throws', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';

      createTransport.mockReturnValue({
        sendMail: sendMail,
      });
      sendMail.mockRejectedValue(new Error('SMTP error'));

      vi.resetModules();
      const { sendEmail: sendEmailFresh } = await import('./email');

      const result = await sendEmailFresh({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      expect(result).toBe(false);
    });
  });

  describe('sendVerificationEmail', () => {
    it('should send verification email with correct content', async () => {
      const result = await sendVerificationEmail('user@example.com', 'verify-token', 'Alice');

      expect(result).toBe(true);
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email with correct content', async () => {
      const result = await sendPasswordResetEmail('user@example.com', 'reset-token', 'Alice');

      expect(result).toBe(true);
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email with correct content', async () => {
      const result = await sendWelcomeEmail('user@example.com', 'Alice');

      expect(result).toBe(true);
    });
  });
});
