import { loadStripe, Stripe } from '@stripe/stripe-js';

/**
 * Stripe Configuration
 * 
 * PRODUCTION SETUP:
 * 1. Create a Stripe account at https://stripe.com
 * 2. Get your publishable key from https://dashboard.stripe.com/apikeys
 * 3. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in your .env.local file
 * 4. Set STRIPE_SECRET_KEY in your backend .env file
 * 5. Create products and prices in Stripe Dashboard
 * 6. Update PRICE_TO_PLAN mapping in backend/src/routes/payments.ts
 * 7. Set up webhook endpoint at /api/payments/webhook
 * 8. Set STRIPE_WEBHOOK_SECRET in backend .env
 */

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9090';

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Get or initialize Stripe instance.
 * Returns null if Stripe is not configured.
 */
export function getStripe(): Promise<Stripe | null> {
  if (!STRIPE_PUBLISHABLE_KEY) {
    console.warn('Stripe not configured: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set');
    return Promise.resolve(null);
  }
  
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
}

/**
 * Check if Stripe is configured.
 */
export function isStripeConfigured(): boolean {
  return !!STRIPE_PUBLISHABLE_KEY;
}

/**
 * Redirect to Stripe Checkout for subscription.
 * @param priceId - Stripe Price ID for the subscription plan
 * @param token - User's auth token
 */
export async function redirectToCheckout(priceId: string, token?: string) {
  const stripe = await getStripe();
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.');
  }

  // Call backend to create a Checkout Session
  const response = await fetch(`${API_URL}/api/payments/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({
      priceId,
      successUrl: `${window.location.origin}/settings?tab=billing&success=true`,
      cancelUrl: `${window.location.origin}/settings?tab=billing&canceled=true`,
    }),
  });

  const session = await response.json();

  if (!response.ok || session.error) {
    throw new Error(session.error || 'Failed to create checkout session');
  }

  // Redirect to Stripe Checkout
  const result = await stripe.redirectToCheckout({
    sessionId: session.id,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

/**
 * Open Stripe billing portal for subscription management.
 * @param token - User's auth token
 */
export async function openBillingPortal(token?: string) {
  const response = await fetch(`${API_URL}/api/payments/create-portal-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok || !data.url) {
    throw new Error(data.error || 'Failed to create billing portal session');
  }

  // Redirect to Stripe billing portal
  window.location.href = data.url;
}

/**
 * Get current subscription status.
 * @param token - User's auth token
 */
export async function getSubscriptionStatus(token?: string) {
  const response = await fetch(`${API_URL}/api/payments/subscription`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch subscription status');
  }

  return response.json();
}
