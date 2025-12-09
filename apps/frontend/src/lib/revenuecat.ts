import { Purchases, LogLevel } from '@revenuecat/purchases-js';

/**
 * RevenueCat Configuration
 * 
 * PRODUCTION SETUP:
 * 1. Create a RevenueCat account at https://www.revenuecat.com
 * 2. Create a new project and get your Public API Key
 * 3. Set NEXT_PUBLIC_REVENUECAT_API_KEY in your .env.local file
 * 4. Configure your products in RevenueCat dashboard
 * 5. Set up entitlements for access control
 * 
 * Note: RevenueCat is primarily for mobile apps (iOS/Android).
 * For web-only subscriptions, consider using Stripe directly.
 */

const REVENUECAT_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY || '';

/**
 * Check if RevenueCat is configured.
 */
export function isRevenueCatConfigured(): boolean {
  return !!REVENUECAT_API_KEY;
}

export class RevenueCatService {
  private static instance: RevenueCatService;
  private purchases: Purchases | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): RevenueCatService {
    if (!RevenueCatService.instance) {
      RevenueCatService.instance = new RevenueCatService();
    }
    return RevenueCatService.instance;
  }

  public async initialize(userId: string) {
    if (this.isInitialized) return;

    if (!REVENUECAT_API_KEY) {
      console.warn('RevenueCat not configured: NEXT_PUBLIC_REVENUECAT_API_KEY is not set');
      return;
    }

    try {
      // Use WARN in production, DEBUG in development
      const logLevel = process.env.NODE_ENV === 'production' ? LogLevel.Warn : LogLevel.Debug;
      Purchases.setLogLevel(logLevel);
      this.purchases = Purchases.configure(REVENUECAT_API_KEY, userId);
      this.isInitialized = true;
      console.log('RevenueCat initialized successfully');
    } catch (error) {
      console.error('Failed to initialize RevenueCat:', error);
    }
  }

  public isReady(): boolean {
    return this.isInitialized && !!this.purchases;
  }

  public async getOfferings() {
    if (!this.purchases) {
      throw new Error('RevenueCat not initialized');
    }
    try {
      const offerings = await this.purchases.getOfferings();
      return offerings;
    } catch (error) {
      console.error('Error fetching offerings:', error);
      throw error;
    }
  }

  public async getCustomerInfo() {
    if (!this.purchases) {
      throw new Error('RevenueCat not initialized');
    }
    try {
      const customerInfo = await this.purchases.getCustomerInfo();
      return customerInfo;
    } catch (error) {
      console.error('Error fetching customer info:', error);
      throw error;
    }
  }

  public async purchasePackage(rcPackage: any) {
    if (!this.purchases) {
      throw new Error('RevenueCat not initialized');
    }
    try {
      const { customerInfo } = await this.purchases.purchasePackage(rcPackage);
      return customerInfo;
    } catch (error) {
      console.error('Error purchasing package:', error);
      throw error;
    }
  }

  public async checkEntitlement(entitlementId: string): Promise<boolean> {
      try {
          const customerInfo = await this.getCustomerInfo();
          if (customerInfo && customerInfo.entitlements.active[entitlementId]) {
              return true;
          }
          return false;
      } catch (error) {
          console.error("Error checking entitlement:", error);
          return false;
      }
  }
}

export const revenueCatService = RevenueCatService.getInstance();
