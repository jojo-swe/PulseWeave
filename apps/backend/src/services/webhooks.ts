import crypto from 'crypto';
import { prisma } from '@pulseweave/database';

/**
 * Available webhook events.
 */
export const WEBHOOK_EVENTS = {
  // Message events
  'message.created': 'A new message was created',
  'message.updated': 'A message was edited',
  'message.deleted': 'A message was deleted',
  'message.pinned': 'A message was pinned',
  'message.reaction_added': 'A reaction was added to a message',
  'message.reaction_removed': 'A reaction was removed from a message',

  // Channel events
  'channel.created': 'A new channel was created',
  'channel.updated': 'A channel was updated',
  'channel.deleted': 'A channel was deleted',

  // User events
  'user.joined': 'A user joined the workspace',
  'user.left': 'A user left the workspace',
  'user.updated': 'A user profile was updated',
  'user.status_changed': 'A user status changed',

  // Workspace events
  'workspace.updated': 'Workspace settings were updated',

  // DM events
  'dm.created': 'A new direct message was sent',
} as const;

export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  workspace: {
    id: string;
    name: string;
  };
  data: Record<string, any>;
}

/**
 * Generates HMAC signature for webhook payload.
 * @param payload - The payload to sign
 * @param secret - The webhook secret
 * @returns HMAC signature
 */
export function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verifies webhook signature.
 * @param payload - The payload to verify
 * @param signature - The signature to verify against
 * @param secret - The webhook secret
 * @returns True if signature is valid
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = generateSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

/**
 * Dispatches a webhook event to all registered webhooks.
 * @param workspaceId - The workspace ID
 * @param event - The event type
 * @param data - The event data
 */
export async function dispatchWebhookEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, any>
): Promise<void> {
  try {
    // Get workspace info
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });

    if (!workspace) return;

    // Find all active webhooks subscribed to this event
    const webhooks = await prisma.webhook.findMany({
      where: {
        workspaceId,
        isActive: true,
      },
    });

    // Filter webhooks by event
    const matchingWebhooks = webhooks.filter((webhook) => {
      const events: string[] = JSON.parse(webhook.events);
      return events.includes(event) || events.includes('*');
    });

    if (matchingWebhooks.length === 0) return;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      workspace: {
        id: workspace.id,
        name: workspace.name,
      },
      data,
    };

    // Dispatch to all matching webhooks
    await Promise.allSettled(
      matchingWebhooks.map((webhook) => deliverWebhook(webhook, payload))
    );
  } catch (error) {
    console.error('Error dispatching webhook event:', error);
  }
}

/**
 * Delivers a webhook to its endpoint.
 * @param webhook - The webhook configuration
 * @param payload - The payload to deliver
 */
async function deliverWebhook(
  webhook: {
    id: string;
    url: string;
    secret: string | null;
    headers: string | null;
    timeoutMs: number;
    retryCount: number;
  },
  payload: WebhookPayload
): Promise<void> {
  const payloadString = JSON.stringify(payload);

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'PulseWeave-Webhook/1.0',
    'X-PulseWeave-Event': payload.event,
    'X-PulseWeave-Delivery': crypto.randomUUID(),
    'X-PulseWeave-Timestamp': payload.timestamp,
  };

  // Add signature if secret is set
  if (webhook.secret) {
    headers['X-PulseWeave-Signature'] = `sha256=${generateSignature(
      payloadString,
      webhook.secret
    )}`;
  }

  // Add custom headers
  if (webhook.headers) {
    try {
      const customHeaders = JSON.parse(webhook.headers);
      Object.assign(headers, customHeaders);
    } catch (e) {
      // Ignore invalid headers
    }
  }

  let lastError: Error | null = null;
  let statusCode: number | null = null;
  let response: string | null = null;
  let success = false;
  let attemptCount = 0;

  // Retry loop
  for (let attempt = 0; attempt < webhook.retryCount; attempt++) {
    attemptCount = attempt + 1;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        webhook.timeoutMs
      );

      const res = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      statusCode = res.status;
      response = await res.text().catch(() => null);

      if (res.ok) {
        success = true;
        break;
      }

      lastError = new Error(`HTTP ${res.status}: ${response?.slice(0, 200)}`);
    } catch (error: any) {
      lastError = error;
      // Exponential backoff
      if (attempt < webhook.retryCount - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }

  // Log delivery
  await prisma.webhookDelivery.create({
    data: {
      webhookId: webhook.id,
      event: payload.event,
      payload: payloadString,
      statusCode,
      response: response?.slice(0, 1000),
      success,
      error: lastError?.message?.slice(0, 500) || null,
      attemptCount,
      deliveredAt: success ? new Date() : null,
    },
  });
}

/**
 * Generates a secure random token for incoming webhooks.
 * @returns A random token
 */
export function generateWebhookToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Processes an incoming webhook payload.
 * @param token - The webhook token
 * @param payload - The incoming payload
 * @param sourceIp - The source IP address
 * @returns Result of processing
 */
export async function processIncomingWebhook(
  token: string,
  payload: {
    text?: string;
    content?: string;
    username?: string;
    avatar_url?: string;
    attachments?: Array<{ url: string; name: string }>;
  },
  sourceIp: string
): Promise<{ success: boolean; error?: string; message?: any }> {
  // Find webhook
  const webhook = await prisma.incomingWebhook.findUnique({
    where: { token },
    include: {
      channel: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!webhook) {
    return { success: false, error: 'Invalid webhook token' };
  }

  if (!webhook.isActive) {
    return { success: false, error: 'Webhook is disabled' };
  }

  // Check IP whitelist
  if (webhook.allowedIps) {
    const allowedIps: string[] = JSON.parse(webhook.allowedIps);
    if (allowedIps.length > 0 && !allowedIps.includes(sourceIp)) {
      return { success: false, error: 'IP not allowed' };
    }
  }

  if (!webhook.channelId || !webhook.channel) {
    return { success: false, error: 'No target channel configured' };
  }

  const content = payload.text || payload.content;
  if (!content) {
    return { success: false, error: 'No message content provided' };
  }

  // Create message
  const message = await prisma.message.create({
    data: {
      content,
      channelId: webhook.channelId,
      userId: webhook.userId,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      reactions: true,
      attachments: true,
    },
  });

  // Update webhook stats
  await prisma.incomingWebhook.update({
    where: { id: webhook.id },
    data: {
      lastUsedAt: new Date(),
      usageCount: { increment: 1 },
    },
  });

  return { success: true, message };
}
