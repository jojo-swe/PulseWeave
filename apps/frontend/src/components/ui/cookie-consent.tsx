'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Cookie, X, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const CONSENT_KEY = 'pulseweave-cookie-consent';

interface ConsentPreferences {
  necessary: boolean; // Always true
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
}

const defaultPreferences: ConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  timestamp: 0,
};

/**
 * Cookie consent banner component.
 * Displays on first visit and allows users to manage cookie preferences.
 */
export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>(defaultPreferences);

  useEffect(() => {
    // Check if consent has been given
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      // Small delay to avoid flash on page load
      const timeout = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timeout);
    } else {
      try {
        const parsed = JSON.parse(stored) as ConsentPreferences;
        setPreferences(parsed);
      } catch {
        setIsVisible(true);
      }
    }
  }, []);

  const savePreferences = (prefs: ConsentPreferences) => {
    const toSave = { ...prefs, timestamp: Date.now() };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(toSave));
    setPreferences(toSave);
    setIsVisible(false);

    // Trigger analytics initialization if accepted
    if (prefs.analytics) {
      initializeAnalytics();
    }
  };

  const acceptAll = () => {
    savePreferences({
      necessary: true,
      analytics: true,
      marketing: true,
      timestamp: Date.now(),
    });
  };

  const acceptNecessary = () => {
    savePreferences({
      necessary: true,
      analytics: false,
      marketing: false,
      timestamp: Date.now(),
    });
  };

  const saveCustom = () => {
    savePreferences(preferences);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Cookie className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-foreground mb-2">Cookie Preferences</h3>
              <p className="text-sm text-muted-foreground mb-4">
                We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies.{' '}
                <Link href="/privacy" className="text-primary hover:underline">
                  Learn more
                </Link>
              </p>

              {/* Cookie details */}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
              >
                <Settings className="w-4 h-4" />
                Customize preferences
                {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showDetails && (
                <div className="space-y-3 mb-4 p-4 rounded-lg bg-muted/50">
                  {/* Necessary cookies */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Necessary</p>
                      <p className="text-xs text-muted-foreground">Required for the site to function</p>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      Always on
                    </div>
                  </div>

                  {/* Analytics cookies */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Analytics</p>
                      <p className="text-xs text-muted-foreground">Help us improve our service</p>
                    </div>
                    <button
                      onClick={() => setPreferences({ ...preferences, analytics: !preferences.analytics })}
                      className={cn(
                        'w-10 h-6 rounded-full transition-colors relative',
                        preferences.analytics ? 'bg-primary' : 'bg-muted'
                      )}
                    >
                      <div
                        className={cn(
                          'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                          preferences.analytics ? 'translate-x-5' : 'translate-x-1'
                        )}
                      />
                    </button>
                  </div>

                  {/* Marketing cookies */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Marketing</p>
                      <p className="text-xs text-muted-foreground">Personalized content and ads</p>
                    </div>
                    <button
                      onClick={() => setPreferences({ ...preferences, marketing: !preferences.marketing })}
                      className={cn(
                        'w-10 h-6 rounded-full transition-colors relative',
                        preferences.marketing ? 'bg-primary' : 'bg-muted'
                      )}
                    >
                      <div
                        className={cn(
                          'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                          preferences.marketing ? 'translate-x-5' : 'translate-x-1'
                        )}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                {showDetails ? (
                  <Button onClick={saveCustom}>Save Preferences</Button>
                ) : (
                  <Button onClick={acceptAll}>Accept All</Button>
                )}
                <Button variant="outline" onClick={acceptNecessary}>
                  Necessary Only
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Initialize analytics based on consent.
 * This is a placeholder - implement your actual analytics here.
 */
function initializeAnalytics() {
  // Example: Initialize Google Analytics, Plausible, etc.
  console.log('[Analytics] Initializing analytics with user consent');
  
  // Example for Google Analytics:
  // if (typeof window !== 'undefined' && window.gtag) {
  //   window.gtag('consent', 'update', {
  //     analytics_storage: 'granted',
  //   });
  // }
}

/**
 * Hook to check cookie consent status.
 */
export function useCookieConsent() {
  const [consent, setConsent] = useState<ConsentPreferences | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored) {
      try {
        setConsent(JSON.parse(stored));
      } catch {
        setConsent(null);
      }
    }
  }, []);

  return consent;
}

/**
 * Check if a specific cookie type is allowed.
 */
export function isCookieAllowed(type: 'analytics' | 'marketing'): boolean {
  if (typeof window === 'undefined') return false;
  
  const stored = localStorage.getItem(CONSENT_KEY);
  if (!stored) return false;
  
  try {
    const consent = JSON.parse(stored) as ConsentPreferences;
    return consent[type] === true;
  } catch {
    return false;
  }
}
