import express from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';

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
 * Get Stripe client lazily to avoid initialization errors when key is missing.
 */
function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.warn('STRIPE_SECRET_KEY not configured - payments disabled');
    return null;
  }
  return new Stripe(secretKey);
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
      console.error('STRIPE_WEBHOOK_SECRET not configured');
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
      console.error('Webhook signature verification failed:', err);
      throw Errors.badRequest('Invalid webhook signature');
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[Stripe] Checkout completed for user: ${session.metadata?.userId}`);
        // TODO: Activate subscription for user
        // await activateSubscription(session.metadata?.userId, session.subscription);
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Stripe] Subscription created: ${subscription.id}`);
        // TODO: Store subscription details
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Stripe] Subscription updated: ${subscription.id}, status: ${subscription.status}`);
        // TODO: Update subscription status
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`[Stripe] Subscription cancelled: ${subscription.id}`);
        // TODO: Deactivate subscription
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[Stripe] Payment succeeded for invoice: ${invoice.id}`);
        // TODO: Record payment
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`[Stripe] Payment failed for invoice: ${invoice.id}`);
        // TODO: Handle failed payment (notify user, retry, etc.)
        break;
      }

      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
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
    // TODO: Implement subscription status lookup
    // For now, return a placeholder
    res.json({
      status: 'inactive',
      plan: null,
      currentPeriodEnd: null,
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

    // TODO: Get customer ID from database
    const customerId = req.body.customerId;
    if (!customerId) {
      throw Errors.badRequest('No subscription found');
    }

    const returnUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?tab=billing`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    res.json({ url: session.url });
  })
);

export default router;
