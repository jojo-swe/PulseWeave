import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

// Note: Environment config is accessed lazily to avoid loading before app init

// Create transporter based on environment
const createTransporter = () => {
  // In development, use ethereal or console logging
  if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
    logger.info('[Email] Development mode: emails will be logged to console');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

let transporter: nodemailer.Transporter | null = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = createTransporter();
  }
  return transporter;
};

const FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@pulseweave.com';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'PulseWeave';
const APP_URL = process.env.FRONTEND_URL || 'http://localhost:9797';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const transport = getTransporter();

  if (!transport) {
    // Development fallback: log to console
    logger.info('='.repeat(60));
    logger.info('[Email] Would send email:');
    logger.info(`  To: ${options.to}`);
    logger.info(`  Subject: ${options.subject}`);
    logger.info(`  Body: ${options.text || options.html.substring(0, 200)}...`);
    logger.info('='.repeat(60));
    return true;
  }

  try {
    await transport.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    return true;
  } catch (error) {
    logger.error('[Email] Failed to send email:', error);
    return false;
  }
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(
  email: string,
  token: string,
  displayName: string
): Promise<boolean> {
  const verifyUrl = `${APP_URL}/verify-email?token=${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <span style="color: white; font-size: 24px;">⚡</span>
      </div>
      <h1 style="margin: 0; color: #18181b; font-size: 24px; font-weight: 700;">Verify your email</h1>
    </div>
    
    <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
      Hi ${displayName},
    </p>
    
    <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
      Thanks for signing up for PulseWeave! Please verify your email address by clicking the button below.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Verify Email Address
      </a>
    </div>
    
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      Or copy and paste this link into your browser:
    </p>
    <p style="color: #6366f1; font-size: 14px; word-break: break-all; margin: 0 0 24px;">
      ${verifyUrl}
    </p>
    
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
      This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
    
    <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 0;">
      © ${new Date().getFullYear()} PulseWeave Inc. All rights reserved.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
Hi ${displayName},

Thanks for signing up for PulseWeave! Please verify your email address by clicking the link below:

${verifyUrl}

This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.

© ${new Date().getFullYear()} PulseWeave Inc.
  `.trim();

  return sendEmail({
    to: email,
    subject: 'Verify your PulseWeave email',
    html,
    text,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  displayName: string
): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <span style="color: white; font-size: 24px;">🔐</span>
      </div>
      <h1 style="margin: 0; color: #18181b; font-size: 24px; font-weight: 700;">Reset your password</h1>
    </div>
    
    <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
      Hi ${displayName},
    </p>
    
    <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
      We received a request to reset your password. Click the button below to choose a new password.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Reset Password
      </a>
    </div>
    
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      Or copy and paste this link into your browser:
    </p>
    <p style="color: #6366f1; font-size: 14px; word-break: break-all; margin: 0 0 24px;">
      ${resetUrl}
    </p>
    
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
      This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
    
    <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 0;">
      © ${new Date().getFullYear()} PulseWeave Inc. All rights reserved.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
Hi ${displayName},

We received a request to reset your password. Click the link below to choose a new password:

${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.

© ${new Date().getFullYear()} PulseWeave Inc.
  `.trim();

  return sendEmail({
    to: email,
    subject: 'Reset your PulseWeave password',
    html,
    text,
  });
}

/**
 * Send welcome email after verification
 */
export async function sendWelcomeEmail(
  email: string,
  displayName: string
): Promise<boolean> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to PulseWeave</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <span style="color: white; font-size: 24px;">🎉</span>
      </div>
      <h1 style="margin: 0; color: #18181b; font-size: 24px; font-weight: 700;">Welcome to PulseWeave!</h1>
    </div>
    
    <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
      Hi ${displayName},
    </p>
    
    <p style="color: #3f3f46; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
      Your email has been verified and your account is ready to go! Here are a few things you can do to get started:
    </p>
    
    <ul style="color: #3f3f46; font-size: 16px; line-height: 1.8; margin: 0 0 24px; padding-left: 24px;">
      <li>Create or join a workspace</li>
      <li>Set up your profile and avatar</li>
      <li>Invite your team members</li>
      <li>Enable two-factor authentication for extra security</li>
    </ul>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${APP_URL}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Open PulseWeave
      </a>
    </div>
    
    <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
      If you have any questions, feel free to reach out to our support team.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
    
    <p style="color: #a1a1aa; font-size: 12px; text-align: center; margin: 0;">
      © ${new Date().getFullYear()} PulseWeave Inc. All rights reserved.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
Hi ${displayName},

Your email has been verified and your account is ready to go! Here are a few things you can do to get started:

- Create or join a workspace
- Set up your profile and avatar
- Invite your team members
- Enable two-factor authentication for extra security

Open PulseWeave: ${APP_URL}

If you have any questions, feel free to reach out to our support team.

© ${new Date().getFullYear()} PulseWeave Inc.
  `.trim();

  return sendEmail({
    to: email,
    subject: 'Welcome to PulseWeave! 🎉',
    html,
    text,
  });
}
