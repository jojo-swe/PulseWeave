'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9090';
const STATUS_CHECK_INTERVAL = 60000; // 1 minute
const BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF = 300000; // 5 minutes max

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  message?: string;
  services?: {
    database: boolean;
    redis?: boolean;
  };
  uptime?: number;
}

interface StatusBannerProps {
  className?: string;
  statusPageUrl?: string;
}

/**
 * Status banner that shows system health and any incidents.
 */
export function StatusBanner({ className, statusPageUrl }: StatusBannerProps) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  useEffect(() => {
    let currentInterval = STATUS_CHECK_INTERVAL;
    let consecutiveFailures = 0;
    let timeoutId: NodeJS.Timeout;

    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${API_URL}/health`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });
        
        clearTimeout(fetchTimeout);
        const data = await response.json();
        
        // Reset backoff on successful response
        consecutiveFailures = 0;
        currentInterval = STATUS_CHECK_INTERVAL;
        
        // Map backend status to our status
        if (data.status === 'healthy') {
          setHealth({ status: 'healthy', services: data.services, uptime: data.uptime });
        } else if (data.status === 'degraded') {
          setHealth({ status: 'degraded', message: 'Some services are experiencing issues', services: data.services });
        } else {
          // unhealthy but server is responding
          setHealth({ status: 'degraded', message: 'Service degraded', services: data.services });
        }
      } catch {
        consecutiveFailures++;
        // Exponential backoff on failures (max 5 min)
        currentInterval = Math.min(
          STATUS_CHECK_INTERVAL * Math.pow(BACKOFF_MULTIPLIER, consecutiveFailures),
          MAX_BACKOFF
        );
        
        // Only show "down" after 2+ consecutive failures to avoid flicker
        if (consecutiveFailures >= 2) {
          setHealth({ status: 'down', message: 'Unable to reach server' });
        }
      }
      setLastCheck(new Date());
      
      // Schedule next check with current interval
      timeoutId = setTimeout(checkHealth, currentInterval);
    };

    // Initial check after short delay
    timeoutId = setTimeout(checkHealth, 2000);

    return () => clearTimeout(timeoutId);
  }, []);

  // Don't show banner if healthy or dismissed
  if (!health || health.status === 'healthy' || dismissed) {
    return null;
  }

  const config = {
    degraded: {
      icon: AlertTriangle,
      bg: 'bg-amber-500/10 border-amber-500/20',
      text: 'text-amber-600 dark:text-amber-400',
      message: health.message || 'Some services are experiencing issues',
    },
    down: {
      icon: AlertTriangle,
      bg: 'bg-destructive/10 border-destructive/20',
      text: 'text-destructive',
      message: health.message || 'Service is currently unavailable',
    },
  }[health.status];

  const Icon = config.icon;

  return (
    <div
      className={cn(
        'border-b px-4 py-2 text-sm',
        config.bg,
        className
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', config.text)} />
          <span className={config.text}>{config.message}</span>
          {statusPageUrl && (
            <a
              href={statusPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('inline-flex items-center gap-1 hover:underline', config.text)}
            >
              View status
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className={cn('p-1 rounded hover:bg-black/10', config.text)}
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Compact status indicator for showing in footer or sidebar.
 */
export function StatusIndicator({ className }: { className?: string }) {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${API_URL}/health/live`, {
          method: 'GET',
        });
        setHealth({ status: response.ok ? 'healthy' : 'degraded' });
      } catch {
        setHealth({ status: 'down' });
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, STATUS_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (!health) return null;

  const config = {
    healthy: {
      color: 'bg-emerald-500',
      label: 'All systems operational',
    },
    degraded: {
      color: 'bg-amber-500',
      label: 'Partial outage',
    },
    down: {
      color: 'bg-destructive',
      label: 'Service disruption',
    },
  }[health.status];

  return (
    <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
      <div className={cn('w-2 h-2 rounded-full', config.color)} />
      <span>{config.label}</span>
    </div>
  );
}

/**
 * Maintenance mode banner.
 * Shows when the app is in scheduled maintenance.
 */
export function MaintenanceBanner({
  message = 'Scheduled maintenance in progress',
  estimatedEnd,
}: {
  message?: string;
  estimatedEnd?: Date;
}) {
  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 text-sm">
        <Info className="w-4 h-4 text-primary" />
        <span className="text-primary font-medium">{message}</span>
        {estimatedEnd && (
          <span className="text-primary/70">
            Expected completion: {estimatedEnd.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Incident banner for active incidents.
 */
export function IncidentBanner({
  title,
  description,
  severity = 'warning',
  statusPageUrl,
  onDismiss,
}: {
  title: string;
  description?: string;
  severity?: 'info' | 'warning' | 'critical';
  statusPageUrl?: string;
  onDismiss?: () => void;
}) {
  const config = {
    info: {
      icon: Info,
      bg: 'bg-blue-500/10 border-blue-500/20',
      text: 'text-blue-600 dark:text-blue-400',
    },
    warning: {
      icon: AlertTriangle,
      bg: 'bg-amber-500/10 border-amber-500/20',
      text: 'text-amber-600 dark:text-amber-400',
    },
    critical: {
      icon: AlertTriangle,
      bg: 'bg-destructive/10 border-destructive/20',
      text: 'text-destructive',
    },
  }[severity];

  const Icon = config.icon;

  return (
    <div className={cn('border-b px-4 py-3', config.bg)}>
      <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Icon className={cn('w-5 h-5 mt-0.5', config.text)} />
          <div>
            <p className={cn('font-medium', config.text)}>{title}</p>
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
            {statusPageUrl && (
              <a
                href={statusPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('inline-flex items-center gap-1 text-sm mt-2 hover:underline', config.text)}
              >
                View updates
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className={cn('p-1 rounded hover:bg-black/10', config.text)}
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
