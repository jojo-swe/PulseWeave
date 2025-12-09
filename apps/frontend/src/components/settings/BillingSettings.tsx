import { useState, useEffect } from 'react';
import { revenueCatService, isRevenueCatConfigured } from '@/lib/revenuecat';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Star, AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function BillingSettings() {
  const { user } = useStore();
  const [loading, setLoading] = useState(true);
  const [offerings, setOfferings] = useState<any>(null);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBilling = async () => {
      if (!user) return;
      
      if (!isRevenueCatConfigured()) {
        setLoading(false);
        return;
      }

      try {
        await revenueCatService.initialize(user.id);
        const [offeringsData, customerData] = await Promise.all([
          revenueCatService.getOfferings(),
          revenueCatService.getCustomerInfo(),
        ]);
        setOfferings(offeringsData);
        setCustomerInfo(customerData);
      } catch (err: any) {
        console.error('Failed to load billing info:', err);
        setError('Failed to load subscription details. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadBilling();
  }, [user]);

  const handlePurchase = async (pkg: any) => {
    setPurchasing(pkg.identifier);
    setError(null);
    try {
      const info = await revenueCatService.purchasePackage(pkg);
      setCustomerInfo(info);
    } catch (err: any) {
      console.error('Purchase failed:', err);
      if (!err.userCancelled) {
        setError(err.message || 'Purchase failed. Please try again.');
      }
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isRevenueCatConfigured()) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Subscription Plans</h2>
          <p className="text-sm text-muted-foreground">
            Upgrade your workspace for advanced features
          </p>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Billing Not Configured</AlertTitle>
          <AlertDescription>
            Billing is not currently enabled in this environment. Please configure RevenueCat credentials to view available plans.
          </AlertDescription>
        </Alert>
        
        {/* Mock Pricing UI for Demo */}
        <div className="grid md:grid-cols-3 gap-6 opacity-60 pointer-events-none grayscale">
          <Card>
            <CardHeader>
              <CardTitle>Free</CardTitle>
              <CardDescription>Essential features for small teams</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$0<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-center"><Check className="mr-2 h-4 w-4 text-green-500" /> Unlimited Messages</li>
                <li className="flex items-center"><Check className="mr-2 h-4 w-4 text-green-500" /> 1 Workspace</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button disabled className="w-full">Current Plan</Button>
            </CardFooter>
          </Card>
          
           <Card className="border-primary">
            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle>Pro</CardTitle>
                <Badge>Popular</Badge>
              </div>
              <CardDescription>Advanced tools for growing teams</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$10<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-center"><Check className="mr-2 h-4 w-4 text-green-500" /> Everything in Free</li>
                <li className="flex items-center"><Check className="mr-2 h-4 w-4 text-green-500" /> Multiple Workspaces</li>
                <li className="flex items-center"><Check className="mr-2 h-4 w-4 text-green-500" /> Advanced Search</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full">Upgrade</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Enterprise</CardTitle>
              <CardDescription>Custom solutions for large orgs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Custom</div>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-center"><Check className="mr-2 h-4 w-4 text-green-500" /> SSO / SAML</li>
                <li className="flex items-center"><Check className="mr-2 h-4 w-4 text-green-500" /> Dedicated Support</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full">Contact Sales</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  const currentEntitlement = customerInfo?.entitlements?.active?.['pro'] ? 'pro' : 'free';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Subscription & Billing</h2>
        <p className="text-sm text-muted-foreground">
          Manage your subscription plan and billing history
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Current Plan Status */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6 flex items-center justify-between">
          <div>
            <div className="font-semibold text-lg flex items-center gap-2">
              Current Plan: <Badge variant={currentEntitlement === 'pro' ? 'default' : 'secondary'}>
                {currentEntitlement === 'pro' ? 'Pro' : 'Free'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {currentEntitlement === 'pro' 
                ? 'Your next billing date is ' + new Date(customerInfo?.latestExpirationDate).toLocaleDateString() 
                : 'Upgrade to unlock advanced features'}
            </p>
          </div>
          {currentEntitlement === 'pro' && (
            <Button variant="outline">Manage Subscription</Button>
          )}
        </CardContent>
      </Card>

      {/* Offerings */}
      {offerings?.current && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
           {/* Render available packages from RevenueCat */}
           {/* This logic would be dynamic based on your actual RevenueCat offerings structure */}
           {offerings.current.availablePackages.map((pkg: any) => (
             <Card key={pkg.identifier} className={cn(
               "flex flex-col",
               currentEntitlement === 'pro' && pkg.identifier.includes('pro') ? "border-primary" : ""
             )}>
               <CardHeader>
                 <CardTitle>{pkg.product.title}</CardTitle>
                 <CardDescription>{pkg.product.description}</CardDescription>
               </CardHeader>
               <CardContent className="flex-1">
                 <div className="text-2xl font-bold">
                   {pkg.product.priceString}
                   <span className="text-sm font-normal text-muted-foreground">/{pkg.product.subscriptionPeriod}</span>
                 </div>
               </CardContent>
               <CardFooter>
                 <Button 
                   className="w-full" 
                   onClick={() => handlePurchase(pkg)}
                   disabled={purchasing === pkg.identifier || (currentEntitlement === 'pro' && pkg.identifier.includes('pro'))}
                 >
                   {purchasing === pkg.identifier ? (
                     <Loader2 className="h-4 w-4 animate-spin" />
                   ) : currentEntitlement === 'pro' && pkg.identifier.includes('pro') ? (
                     'Current Plan'
                   ) : (
                     'Upgrade'
                   )}
                 </Button>
               </CardFooter>
             </Card>
           ))}
        </div>
      )}
    </div>
  );
}
