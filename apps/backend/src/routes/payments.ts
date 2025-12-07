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
  process.env.API_URL || 'http://localhost:3001',
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

export default router;
