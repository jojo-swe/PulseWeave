
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-js';

// TODO: Replace with your actual RevenueCat Public API Key
const REVENUECAT_API_KEY = 'appl_PLACEHOLDER_KEY';

export class RevenueCatService {
  private static instance: RevenueCatService;
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

    try {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG); // Set to WARN/ERROR in production
      await Purchases.configure(REVENUECAT_API_KEY, userId);
      this.isInitialized = true;
      console.log('RevenueCat initialized successfully');
    } catch (error) {
      console.error('Failed to initialize RevenueCat:', error);
    }
  }

  public async getOfferings() {
    if (!this.isInitialized) {
      throw new Error('RevenueCat not initialized');
    }
    try {
      const offerings = await Purchases.getOfferings();
      return offerings;
    } catch (error) {
      console.error('Error fetching offerings:', error);
      throw error;
    }
  }

  public async getCustomerInfo() {
    if (!this.isInitialized) {
      throw new Error('RevenueCat not initialized');
    }
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfo;
    } catch (error) {
      console.error('Error fetching customer info:', error);
      throw error;
    }
  }

  public async purchasePackage(rcPackage: any) {
    if (!this.isInitialized) {
      throw new Error('RevenueCat not initialized');
    }
    try {
      const { customerInfo } = await Purchases.purchasePackage(rcPackage);
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
