import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';

const router = Router();

/**
 * Available integration types with their configurations.
 */
export const INTEGRATION_TYPES = {
  n8n: {
    name: 'n8n',
    displayName: 'n8n',
    description: 'Open-source workflow automation tool',
    icon: 'n8n',
    configSchema: {
      webhookUrl: { type: 'string', label: 'Webhook URL', required: true },
      apiKey: { type: 'string', label: 'API Key (optional)', required: false },
    },
    events: ['message.created', 'user.joined', 'channel.created'],
  },
  zapier: {
    name: 'zapier',
    displayName: 'Zapier',
    description: 'Connect PulseWeave to 5,000+ apps',
    icon: 'zapier',
    configSchema: {
      webhookUrl: { type: 'string', label: 'Zap Webhook URL', required: true },
    },
    events: ['message.created', 'user.joined', 'channel.created'],
  },
  make: {
    name: 'make',
    displayName: 'Make (Integromat)',
    description: 'Visual automation platform',
    icon: 'make',
    configSchema: {
      webhookUrl: { type: 'string', label: 'Webhook URL', required: true },
    },
    events: ['message.created', 'user.joined', 'channel.created'],
  },
  slack: {
    name: 'slack',
    displayName: 'Slack',
    description: 'Forward messages to Slack channels',
    icon: 'slack',
    configSchema: {
      webhookUrl: { type: 'string', label: 'Slack Webhook URL', required: true },
      channel: { type: 'string', label: 'Channel (optional)', required: false },
    },
    events: ['message.created'],
  },
  discord: {
    name: 'discord',
    displayName: 'Discord',
    description: 'Forward messages to Discord channels',
    icon: 'discord',
    configSchema: {
      webhookUrl: { type: 'string', label: 'Discord Webhook URL', required: true },
    },
    events: ['message.created'],
  },
  email: {
    name: 'email',
    displayName: 'Email Notifications',
    description: 'Send email notifications for events',
    icon: 'mail',
    configSchema: {
      recipients: { type: 'string', label: 'Email Recipients (comma-separated)', required: true },
      events: { type: 'array', label: 'Events to notify', required: true },
    },
    events: ['message.created', 'user.joined', 'channel.created'],
  },
  custom: {
    name: 'custom',
    displayName: 'Custom Integration',
    description: 'Build your own integration with webhooks',
    icon: 'code',
    configSchema: {
      webhookUrl: { type: 'string', label: 'Webhook URL', required: true },
      headers: { type: 'object', label: 'Custom Headers (JSON)', required: false },
      events: { type: 'array', label: 'Events to subscribe', required: true },
    },
    events: ['*'],
  },
} as const;

export type IntegrationType = keyof typeof INTEGRATION_TYPES;

const createIntegrationSchema = z.object({
  type: z.enum(['n8n', 'zapier', 'make', 'slack', 'discord', 'email', 'custom']),
  name: z.string().min(1).max(100),
  config: z.record(z.any()),
});

const updateIntegrationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Get available integration types.
 */
router.get('/types', authenticateToken, (req, res) => {
  res.json(INTEGRATION_TYPES);
});

/**
 * List integrations for a workspace.
 */
router.get(
  '/workspace/:workspaceId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { workspaceId } = req.params;

    // Verify admin access
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId: req.userId!, workspaceId },
      },
    });

    if (!membership || !['admin', 'owner'].includes(membership.roleName)) {
      throw Errors.forbidden('Admin access required');
    }

    const integrations = await prisma.integration.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: { id: true, displayName: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      integrations.map((i) => ({
        ...i,
        config: JSON.parse(i.config),
        typeInfo: INTEGRATION_TYPES[i.type as IntegrationType] || null,
      }))
    );
  })
);

/**
 * Get a single integration.
 */
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const integration = await prisma.integration.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, displayName: true, username: true },
        },
      },
    });

    if (!integration) {
      throw Errors.notFound('Integration');
    }

    // Verify access
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.userId!,
          workspaceId: integration.workspaceId,
        },
      },
    });

    if (!membership || !['admin', 'owner'].includes(membership.roleName)) {
      throw Errors.forbidden('Admin access required');
    }

    res.json({
      ...integration,
      config: JSON.parse(integration.config),
      typeInfo: INTEGRATION_TYPES[integration.type as IntegrationType] || null,
    });
  })
);

/**
 * Create an integration.
 */
router.post(
  '/workspace/:workspaceId',
  authenticateToken,
  validate(createIntegrationSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { workspaceId } = req.params;
    const { type, name, config } = req.body;

    // Verify admin access
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId: req.userId!, workspaceId },
      },
    });

    if (!membership || !['admin', 'owner'].includes(membership.roleName)) {
      throw Errors.forbidden('Admin access required');
    }

    // Validate config against type schema
    const typeInfo = INTEGRATION_TYPES[type as IntegrationType];
    if (!typeInfo) {
      throw Errors.badRequest(`Invalid integration type: ${type}`);
    }

    // Check required fields
    for (const [field, schema] of Object.entries(typeInfo.configSchema)) {
      if ((schema as any).required && !config[field]) {
        throw Errors.badRequest(`Missing required field: ${field}`);
      }
    }

    const integration = await prisma.integration.create({
      data: {
        type,
        name,
        config: JSON.stringify(config),
        workspaceId,
        userId: req.userId!,
        status: 'pending',
      },
      include: {
        user: {
          select: { id: true, displayName: true, username: true },
        },
      },
    });

    // Test the integration (for webhook-based integrations)
    let status = 'connected';
    if (config.webhookUrl) {
      try {
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'integration.test',
            timestamp: new Date().toISOString(),
            integration: {
              id: integration.id,
              name: integration.name,
              type: integration.type,
            },
          }),
        });
        status = response.ok ? 'connected' : 'error';
      } catch (error) {
        status = 'error';
      }
    }

    // Update status
    const updated = await prisma.integration.update({
      where: { id: integration.id },
      data: { status },
    });

    res.status(201).json({
      ...updated,
      config: JSON.parse(updated.config),
      typeInfo,
      user: integration.user,
    });
  })
);

/**
 * Update an integration.
 */
router.patch(
  '/:id',
  authenticateToken,
  validate(updateIntegrationSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { name, config, isActive } = req.body;

    const integration = await prisma.integration.findUnique({
      where: { id },
    });

    if (!integration) {
      throw Errors.notFound('Integration');
    }

    // Verify admin access
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.userId!,
          workspaceId: integration.workspaceId,
        },
      },
    });

    if (!membership || !['admin', 'owner'].includes(membership.roleName)) {
      throw Errors.forbidden('Admin access required');
    }

    const updated = await prisma.integration.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(config !== undefined && { config: JSON.stringify(config) }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        user: {
          select: { id: true, displayName: true, username: true },
        },
      },
    });

    res.json({
      ...updated,
      config: JSON.parse(updated.config),
      typeInfo: INTEGRATION_TYPES[updated.type as IntegrationType] || null,
    });
  })
);

/**
 * Delete an integration.
 */
router.delete(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const integration = await prisma.integration.findUnique({
      where: { id },
    });

    if (!integration) {
      throw Errors.notFound('Integration');
    }

    // Verify admin access
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.userId!,
          workspaceId: integration.workspaceId,
        },
      },
    });

    if (!membership || !['admin', 'owner'].includes(membership.roleName)) {
      throw Errors.forbidden('Admin access required');
    }

    await prisma.integration.delete({ where: { id } });

    res.json({ success: true });
  })
);

/**
 * Test an integration.
 */
router.post(
  '/:id/test',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const { id } = req.params;

    const integration = await prisma.integration.findUnique({
      where: { id },
    });

    if (!integration) {
      throw Errors.notFound('Integration');
    }

    // Verify admin access
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.userId!,
          workspaceId: integration.workspaceId,
        },
      },
    });

    if (!membership || !['admin', 'owner'].includes(membership.roleName)) {
      throw Errors.forbidden('Admin access required');
    }

    const config = JSON.parse(integration.config);

    if (!config.webhookUrl) {
      throw Errors.badRequest('Integration does not have a webhook URL');
    }

    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'integration.test',
          timestamp: new Date().toISOString(),
          integration: {
            id: integration.id,
            name: integration.name,
            type: integration.type,
          },
          message: 'Test message from PulseWeave',
        }),
      });

      const responseText = await response.text().catch(() => '');

      // Update status
      await prisma.integration.update({
        where: { id },
        data: {
          status: response.ok ? 'connected' : 'error',
          lastSyncAt: new Date(),
        },
      });

      res.json({
        success: response.ok,
        statusCode: response.status,
        response: responseText.slice(0, 500),
      });
    } catch (error: any) {
      // Update status
      await prisma.integration.update({
        where: { id },
        data: { status: 'error' },
      });

      res.json({
        success: false,
        error: error.message,
      });
    }
  })
);

export default router;
