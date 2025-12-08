
import { loadStripe } from '@stripe/stripe-js';

// TODO: Replace with your actual Stripe Publishable Key
const STRIPE_PUBLISHABLE_KEY = 'pk_test_PLACEHOLDER_KEY';

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

export async function redirectToCheckout(priceId: string) {
  const stripe = await stripePromise;
  if (!stripe) {
    throw new Error('Stripe failed to initialize.');
  }

  // Call your backend to create a Checkout Session
  const response = await fetch('http://localhost:9090/api/payments/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      priceId,
      successUrl: window.location.origin + '/success.html',
      cancelUrl: window.location.origin + '/index.html#pricing',
    }),
  });

  const session = await response.json();

  if (session.error) {
    throw new Error(session.error);
  }

  // Redirect to Stripe Checkout
  const result = await stripe.redirectToCheckout({
    sessionId: session.id,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}
