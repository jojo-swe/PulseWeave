
import express from 'express';
import Stripe from 'stripe';

// TODO: Replace with env variable in production: process.env.STRIPE_SECRET_KEY
const stripe = new Stripe('sk_test_PLACEHOLDER_SECRET_KEY', {
  apiVersion: '2023-10-16',
});

const router = express.Router();

router.post('/create-checkout-session', async (req, res) => {
  try {
    const { priceId, successUrl, cancelUrl } = req.body;

    if (!priceId) {
      return res.status(400).json({ error: 'Price ID is required' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || 'http://localhost:3000/success',
      cancel_url: cancelUrl || 'http://localhost:3000/pricing',
    });

    res.json({ id: session.id });
  } catch (error: any) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
