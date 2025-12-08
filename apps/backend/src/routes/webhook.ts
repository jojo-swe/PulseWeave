import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
import {
  WEBHOOK_EVENTS,
  generateWebhookToken,
  processIncomingWebhook,
} from '../services/webhooks';
import crypto from 'crypto';
import { hasAdminAccess } from '../utils/workspace-access';
import { validateWebhookUrl } from '../utils/url-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const router = Router();

// ============================================================================
// Outgoing Webhooks (notify external services)
// ============================================================================

const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().optional(),
  headers: z.record(z.string()).optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional(),
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  secret: z.string().optional(),
  headers: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional(),
});

/**
 * Get available webhook events.
 */
router.get('/events', authenticateToken, (req, res) => {
  res.json(WEBHOOK_EVENTS);
});

/**
 * List webhooks for a workspace.
 */
router.get(
  '/workspace/:workspaceId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { workspaceId } = req.params;

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    const webhooks = await prisma.webhook.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: { id: true, displayName: true, username: true },
        },
        _count: {
          select: { deliveries: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Parse JSON fields
    const result = webhooks.map((w) => ({
      ...w,
      events: JSON.parse(w.events),
      headers: w.headers ? JSON.parse(w.headers) : null,
      secret: w.secret ? '••••••••' : null, // Mask secret
    }));

    res.json(result);
  })
);

/**
 * Create a webhook.
 */
router.post(
  '/workspace/:workspaceId',
  authenticateToken,
  validate(createWebhookSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { workspaceId } = req.params;
    const { name, url, events, secret, headers, retryCount, timeoutMs } = req.body;

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    // SECURITY: Validate webhook URL to prevent SSRF attacks
    const urlValidation = validateWebhookUrl(url);
    if (!urlValidation.isValid) {
      throw Errors.badRequest(`Invalid webhook URL: ${urlValidation.error}`);
    }

    // Validate events
    const validEvents = Object.keys(WEBHOOK_EVENTS);
    for (const event of events) {
      if (event !== '*' && !validEvents.includes(event)) {
        throw Errors.badRequest(`Invalid event: ${event}`);
      }
    }

    const webhook = await prisma.webhook.create({
      data: {
        name,
        url,
        events: JSON.stringify(events),
        secret: secret || null,
        headers: headers ? JSON.stringify(headers) : null,
        retryCount: retryCount ?? 3,
        timeoutMs: timeoutMs ?? 5000,
        workspaceId,
        userId: req.userId!,
      },
    });

    res.status(201).json({
      ...webhook,
      events: JSON.parse(webhook.events),
      headers: webhook.headers ? JSON.parse(webhook.headers) : null,
      secret: webhook.secret ? '••••••••' : null,
    });
  })
);

/**
 * Update a webhook.
 */
router.patch(
  '/:id',
  authenticateToken,
  validate(updateWebhookSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { name, url, events, secret, headers, isActive, retryCount, timeoutMs } =
      req.body;

    const webhook = await prisma.webhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      throw Errors.notFound('Webhook');
    }

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, webhook.workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    // SECURITY: Validate webhook URL if being updated
    if (url !== undefined) {
      const urlValidation = validateWebhookUrl(url);
      if (!urlValidation.isValid) {
        throw Errors.badRequest(`Invalid webhook URL: ${urlValidation.error}`);
      }
    }

    // Validate events if provided
    if (events) {
      const validEvents = Object.keys(WEBHOOK_EVENTS);
      for (const event of events) {
        if (event !== '*' && !validEvents.includes(event)) {
          throw Errors.badRequest(`Invalid event: ${event}`);
        }
      }
    }

    const updated = await prisma.webhook.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(url !== undefined && { url }),
        ...(events !== undefined && { events: JSON.stringify(events) }),
        ...(secret !== undefined && { secret }),
        ...(headers !== undefined && { headers: JSON.stringify(headers) }),
        ...(isActive !== undefined && { isActive }),
        ...(retryCount !== undefined && { retryCount }),
        ...(timeoutMs !== undefined && { timeoutMs }),
      },
    });

    res.json({
      ...updated,
      events: JSON.parse(updated.events),
      headers: updated.headers ? JSON.parse(updated.headers) : null,
      secret: updated.secret ? '••••••••' : null,
    });
  })
);

/**
 * Delete a webhook.
 */
router.delete(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const webhook = await prisma.webhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      throw Errors.notFound('Webhook');
    }

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, webhook.workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    await prisma.webhook.delete({ where: { id } });

    res.json({ success: true });
  })
);

/**
 * Get webhook delivery history.
 */
router.get(
  '/:id/deliveries',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { page = '1', limit = '50' } = req.query;

    const webhook = await prisma.webhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      throw Errors.notFound('Webhook');
    }

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, webhook.workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const skip = (pageNum - 1) * limitNum;

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where: { webhookId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.webhookDelivery.count({ where: { webhookId: id } }),
    ]);

    res.json({
      deliveries: deliveries.map((d) => ({
        ...d,
        payload: JSON.parse(d.payload),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  })
);

/**
 * Test a webhook by sending a test event.
 */
router.post(
  '/:id/test',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const webhook = await prisma.webhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      throw Errors.notFound('Webhook');
    }

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, webhook.workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    // Get workspace info
    const workspace = await prisma.workspace.findUnique({
      where: { id: webhook.workspaceId },
      select: { id: true, name: true },
    });

    // Send test event
    const payload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      workspace: workspace,
      data: {
        message: 'This is a test webhook delivery from PulseWeave',
        triggeredBy: req.userId,
      },
    };

    const payloadString = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'PulseWeave-Webhook/1.0',
      'X-PulseWeave-Event': 'test',
      'X-PulseWeave-Delivery': crypto.randomUUID(),
      'X-PulseWeave-Timestamp': payload.timestamp,
    };

    if (webhook.secret) {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(payloadString)
        .digest('hex');
      headers['X-PulseWeave-Signature'] = `sha256=${signature}`;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), webhook.timeoutMs);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseText = await response.text().catch(() => '');

      // Log delivery
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event: 'test',
          payload: payloadString,
          statusCode: response.status,
          response: responseText.slice(0, 1000),
          success: response.ok,
          deliveredAt: response.ok ? new Date() : null,
        },
      });

      res.json({
        success: response.ok,
        statusCode: response.status,
        response: responseText.slice(0, 500),
      });
    } catch (error: any) {
      // Log failed delivery
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event: 'test',
          payload: payloadString,
          success: false,
          error: error.message?.slice(0, 500),
        },
      });

      res.json({
        success: false,
        error: error.message,
      });
    }
  })
);

// ============================================================================
// Incoming Webhooks (receive from external services)
// ============================================================================

const createIncomingWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  channelId: z.string().optional(),
  allowedIps: z.array(z.string()).optional(),
});

const updateIncomingWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  channelId: z.string().optional(),
  allowedIps: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * List incoming webhooks for a workspace.
 */
router.get(
  '/incoming/workspace/:workspaceId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { workspaceId } = req.params;

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    const webhooks = await prisma.incomingWebhook.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: { id: true, displayName: true, username: true },
        },
        channel: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = webhooks.map((w) => ({
      ...w,
      allowedIps: w.allowedIps ? JSON.parse(w.allowedIps) : [],
      webhookUrl: `${process.env.API_URL || 'http://localhost:9090'}/api/hooks/${w.token}`,
    }));

    res.json(result);
  })
);

/**
 * Create an incoming webhook.
 */
router.post(
  '/incoming/workspace/:workspaceId',
  authenticateToken,
  validate(createIncomingWebhookSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { workspaceId } = req.params;
    const { name, channelId, allowedIps } = req.body;

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    // Verify channel exists if provided
    if (channelId) {
      const channel = await prisma.channel.findFirst({
        where: { id: channelId, workspaceId },
      });
      if (!channel) {
        throw Errors.notFound('Channel');
      }
    }

    const token = generateWebhookToken();

    const webhook = await prisma.incomingWebhook.create({
      data: {
        name,
        token,
        channelId,
        allowedIps: allowedIps ? JSON.stringify(allowedIps) : null,
        workspaceId,
        userId: req.userId!,
      },
      include: {
        channel: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json({
      ...webhook,
      allowedIps: webhook.allowedIps ? JSON.parse(webhook.allowedIps) : [],
      webhookUrl: `${process.env.API_URL || 'http://localhost:9090'}/api/hooks/${webhook.token}`,
    });
  })
);

/**
 * Update an incoming webhook.
 */
router.patch(
  '/incoming/:id',
  authenticateToken,
  validate(updateIncomingWebhookSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { name, channelId, allowedIps, isActive } = req.body;

    const webhook = await prisma.incomingWebhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      throw Errors.notFound('Webhook');
    }

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, webhook.workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    // Verify channel exists if provided
    if (channelId) {
      const channel = await prisma.channel.findFirst({
        where: { id: channelId, workspaceId: webhook.workspaceId },
      });
      if (!channel) {
        throw Errors.notFound('Channel');
      }
    }

    const updated = await prisma.incomingWebhook.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(channelId !== undefined && { channelId }),
        ...(allowedIps !== undefined && {
          allowedIps: JSON.stringify(allowedIps),
        }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        channel: {
          select: { id: true, name: true },
        },
      },
    });

    res.json({
      ...updated,
      allowedIps: updated.allowedIps ? JSON.parse(updated.allowedIps) : [],
      webhookUrl: `${process.env.API_URL || 'http://localhost:9090'}/api/hooks/${updated.token}`,
    });
  })
);

/**
 * Delete an incoming webhook.
 */
router.delete(
  '/incoming/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const webhook = await prisma.incomingWebhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      throw Errors.notFound('Webhook');
    }

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, webhook.workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    await prisma.incomingWebhook.delete({ where: { id } });

    res.json({ success: true });
  })
);

/**
 * Regenerate incoming webhook token.
 */
router.post(
  '/incoming/:id/regenerate',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const webhook = await prisma.incomingWebhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      throw Errors.notFound('Webhook');
    }

    // Verify admin access (workspace owner OR admin role)
    if (!(await hasAdminAccess(req.userId!, webhook.workspaceId))) {
      throw Errors.forbidden('Admin access required');
    }

    const newToken = generateWebhookToken();

    const updated = await prisma.incomingWebhook.update({
      where: { id },
      data: { token: newToken },
      include: {
        channel: {
          select: { id: true, name: true },
        },
      },
    });

    res.json({
      ...updated,
      allowedIps: updated.allowedIps ? JSON.parse(updated.allowedIps) : [],
      webhookUrl: `${process.env.API_URL || 'http://localhost:9090'}/api/hooks/${updated.token}`,
    });
  })
);

// ============================================================================
// Public Incoming Webhook Endpoint (no auth required)
// ============================================================================

/**
 * Rate limiter for incoming webhooks.
 * Limits each IP to 60 requests per minute to prevent abuse.
 */
const incomingWebhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP
  message: { error: 'Too many webhook requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use the webhook token as part of the key to allow per-webhook limits
    return `${(ipKeyGenerator as any)(req)}-${req.params.token}`;
  },
});

/**
 * Receive incoming webhook payload.
 * POST /api/hooks/:token
 */
router.post(
  '/hooks/:token',
  incomingWebhookLimiter,
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const sourceIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.socket.remoteAddress ||
      '';

    const result = await processIncomingWebhook(token, req.body, sourceIp);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Emit socket event for new message
    const io = req.app.get('io');
    if (io && result.message) {
      io.to(`channel:${result.message.channelId}`).emit('message:new', result.message);
    }

    res.json({ success: true, message: result.message });
  })
);

export default router;
