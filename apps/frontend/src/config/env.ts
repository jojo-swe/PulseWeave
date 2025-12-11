/**
 * Centralized environment configuration
 * Import this instead of using process.env directly
 */

// API Configuration
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9090';

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
  const required = {
    NEXT_PUBLIC_API_URL: API_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: STRIPE_PUBLISHABLE_KEY,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value || value === 'http://localhost:9090')
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    if (typeof window === 'undefined') {
      // Server-side only - don't crash browser
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
}
