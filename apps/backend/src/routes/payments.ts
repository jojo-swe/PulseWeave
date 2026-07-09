import express from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
import { logger } from '../utils/logger';

// Plan mapping from Stripe price IDs to plan names
// PRODUCTION: Update these with your actual Stripe price IDs
const PRICE_TO_PLAN: Record<string, string> = {
  'price_pro_monthly': 'pro',
  'price_pro_yearly': 'pro',
  'price_enterprise_monthly': 'enterprise',
  'price_enterprise_yearly': 'enterprise',
};

const router = express.Router();

/**
 * Allowed redirect URL origins for payment callbacks.
 * SECURITY: Prevents open redirect attacks.
 */
const ALLOWED_REDIRECT_ORIGINS = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  process.env.API_URL || 'http://localhost:9090',
].filter(Boolean);

/**
 * Validates that a URL is safe for redirects.
 * @param url - URL to validate
 * @returns True if URL is safe
 */
function isAllowedRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_REDIRECT_ORIGINS.some(origin => {
      const allowedOrigin = new URL(origin);
      return parsed.origin === allowedOrigin.origin;
    });
  } catch {
    return false;
  }
}

/**
 * Get Stripe client lazily (singleton) to avoid initialization errors when key is missing
 * and to avoid creating a new instance on every request.
 */
let stripeInstance: Stripe | null = null;
let stripeChecked = false;

function getStripeClient(): Stripe | null {
  if (stripeChecked) return stripeInstance;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    logger.warn('STRIPE_SECRET_KEY not configured - payments disabled');
    stripeChecked = true;
    return null;
  }
  stripeInstance = new Stripe(secretKey);
  stripeChecked = true;
  return stripeInstance;
}

const createCheckoutSchema = z.object({
  priceId: z.string().min(1, 'Price ID is required'),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/**
 * Create a Stripe checkout session.
 * Requires authentication.
 */
router.post(
  '/create-checkout-session',
  authenticateToken,
  validate(createCheckoutSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const stripe = getStripeClient();
    if (!stripe) {
      throw Errors.internal('Payment processing is not configured');
    }

    const { priceId, successUrl, cancelUrl } = req.body;

    // SECURITY: Validate redirect URLs to prevent open redirect attacks
    const defaultSuccessUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/success`;
    const defaultCancelUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pricing`;

    const finalSuccessUrl = successUrl && isAllowedRedirectUrl(successUrl) ? successUrl : defaultSuccessUrl;
    const finalCancelUrl = cancelUrl && isAllowedRedirectUrl(cancelUrl) ? cancelUrl : defaultCancelUrl;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      client_reference_id: req.userId, // Link session to user
      metadata: {
        userId: req.userId!,
      },
    });

    res.json({ id: session.id });
  })
);

/**
 * Stripe webhook handler.
 * Verifies webhook signature and processes events.
 * 
 * IMPORTANT: This endpoint must receive the raw body for signature verification.
 * Configure express.raw() middleware for this route in your main app.
 */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const stripe = getStripeClient();
    if (!stripe) {
      throw Errors.internal('Payment processing is not configured');
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET not configured');
      throw Errors.internal('Webhook not configured');
    }

    const sig = req.headers['stripe-signature'];
    if (!sig) {
      throw Errors.badRequest('Missing stripe-signature header');
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      logger.error('Webhook signature verification failed:', err);
      throw Errors.badRequest('Invalid webhook signature');
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId || session.client_reference_id;
        logger.info(`[Stripe] Checkout completed for user: ${userId}`);
        
        if (userId && session.customer && session.subscription) {
          // Create or update subscription record
          await prisma.subscription.upsert({
            where: { userId },
            create: {
              userId,
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              status: 'active',
              plan: 'pro', // Default, will be updated by subscription.created event
            },
            update: {
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              status: 'active',
            },
          });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        logger.info(`[Stripe] Subscription ${event.type === 'customer.subscription.created' ? 'created' : 'updated'}: ${subscription.id}, status: ${subscription.status}`);
        
        // Find user by Stripe customer ID
        const existingSub = await prisma.subscription.findFirst({
          where: { stripeCustomerId: subscription.customer as string },
        });
        
        if (existingSub) {
          const priceId = subscription.items.data[0]?.price?.id;
          const plan = priceId ? (PRICE_TO_PLAN[priceId] || 'pro') : existingSub.plan;
          
          await prisma.subscription.update({
            where: { id: existingSub.id },
            data: {
              stripeSubscriptionId: subscription.id,
              stripePriceId: priceId,
              status: subscription.status,
              plan,
              currentPeriodStart: new Date((subscription as unknown as Record<string, number>).current_period_start! * 1000),
              currentPeriodEnd: new Date((subscription as unknown as Record<string, number>).current_period_end! * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        logger.info(`[Stripe] Subscription cancelled: ${subscription.id}`);
        
        // Mark subscription as canceled
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: 'canceled',
            plan: 'free',
          },
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        logger.info(`[Stripe] Payment succeeded for invoice: ${invoice.id}`);
        
        // Update subscription status to active if it was past_due
        if ((invoice as unknown as Record<string, string | null>).subscription) {
          await prisma.subscription.updateMany({
            where: { 
              stripeSubscriptionId: (invoice as unknown as Record<string, string | null>).subscription as string,
              status: 'past_due',
            },
            data: { status: 'active' },
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        logger.info(`[Stripe] Payment failed for invoice: ${invoice.id}`);
        
        // Mark subscription as past_due
        if ((invoice as unknown as Record<string, string | null>).subscription) {
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: (invoice as unknown as Record<string, string | null>).subscription as string },
            data: { status: 'past_due' },
          });
        }
        break;
      }

      default:
        logger.info(`[Stripe] Unhandled event type: ${event.type}`);
    }

    // Return 200 to acknowledge receipt
    res.json({ received: true });
  })
);

/**
 * Get subscription status for current user.
 */
router.get(
  '/subscription',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.userId! },
    });

    if (!subscription) {
      return res.json({
        status: 'inactive',
        plan: 'free',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
    }

    res.json({
      status: subscription.status,
      plan: subscription.plan,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    });
  })
);

/**
 * Create a billing portal session for managing subscription.
 */
router.post(
  '/create-portal-session',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res) => {
    const stripe = getStripeClient();
    if (!stripe) {
      throw Errors.internal('Payment processing is not configured');
    }

    // Get customer ID from database
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.userId! },
    });

    if (!subscription?.stripeCustomerId) {
      throw Errors.badRequest('No subscription found');
    }

    const returnUrl = `${process.env.FRONTEND_URL || 'http://localhost:9797'}/settings?tab=billing`;

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    res.json({ url: session.url });
  })
);

export default router;
