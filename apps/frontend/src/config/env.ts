/**
 * Centralized environment configuration
 * Import this instead of using process.env directly
 */

// API Configuration
const DEFAULT_API_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:9090';
export const API_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;

// Third-party Services
export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
export const REVENUECAT_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY || '';
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 
  'BAOcikxVSXADQjF9KPhx-AfJ3HxPVmKF5J6vFVnGj7ynr4Yt8isWprctA2O7kaA6NWprqXMst9blsgODbZg8aHc';

// Environment
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_DEVELOPMENT = NODE_ENV === 'development';

// Validate required environment variables in production
if (IS_PRODUCTION) {
  if (!process.env.NEXT_PUBLIC_API_URL) {
    console.warn('⚠️  NEXT_PUBLIC_API_URL is not set. Frontend will call the API using same-origin requests (requires a reverse proxy).');
  }

  if (!STRIPE_PUBLISHABLE_KEY) {
    console.warn('⚠️  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. Stripe features will be disabled.');
  }
}
