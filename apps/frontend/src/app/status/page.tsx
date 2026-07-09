'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  RefreshCw,
  Server,
  Database,
  Wifi,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9090';

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  message?: string;
}

export default function StatusPage() {
  const router = useRouter();
  const { user } = useStore();
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [overallStatus, setOverallStatus] = useState<'operational' | 'degraded' | 'down'>('operational');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const checkStatus = async () => {
    setLoading(true);
    const results: ServiceStatus[] = [];

    // Check API
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${API_URL}/health/live`, { signal: controller.signal });
      clearTimeout(timeout);
      
      results.push({
        name: 'API Server',
        status: response.ok ? 'operational' : 'degraded',
      });
    } catch {
      results.push({
        name: 'API Server',
        status: 'down',
        message: 'Unable to connect',
      });
    }

    // Check WebSocket
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${API_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        results.push({
          name: 'Real-time Messaging',
          status: data.services?.websocket?.status === 'up' ? 'operational' : 'degraded',
        });
        results.push({
          name: 'Database',
          status: data.services?.database?.status === 'up' ? 'operational' : 
                  data.services?.database?.status === 'degraded' ? 'degraded' : 'down',
          message: data.services?.database?.message,
        });
      } else {
        results.push({ name: 'Real-time Messaging', status: 'degraded' });
        results.push({ name: 'Database', status: 'degraded' });
      }
    } catch {
      results.push({ name: 'Real-time Messaging', status: 'down' });
      results.push({ name: 'Database', status: 'down' });
    }

    setServices(results);
    setLastUpdated(new Date());
    
    // Determine overall status
    const hasDown = results.some(s => s.status === 'down');
    const hasDegraded = results.some(s => s.status === 'degraded');
    setOverallStatus(hasDown ? 'down' : hasDegraded ? 'degraded' : 'operational');
    
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial status check triggers state updates
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default:
        return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const getServiceIcon = (name: string) => {
    if (name.includes('API')) return <Server className="w-5 h-5" />;
    if (name.includes('Database')) return <Database className="w-5 h-5" />;
    return <Wifi className="w-5 h-5" />;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-xl font-bold">System Status</h1>
            </div>
            <Button variant="outline" size="sm" onClick={checkStatus} disabled={loading}>
              <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Overall Status */}
        <div className={cn(
          'p-6 rounded-xl border-2 mb-8 text-center',
          overallStatus === 'operational' && 'bg-emerald-500/5 border-emerald-500/20',
          overallStatus === 'degraded' && 'bg-amber-500/5 border-amber-500/20',
          overallStatus === 'down' && 'bg-destructive/5 border-destructive/20'
        )}>
          <div className="flex justify-center mb-3">
            {getStatusIcon(overallStatus)}
          </div>
          <h2 className={cn(
            'text-xl font-bold mb-1',
            overallStatus === 'operational' && 'text-emerald-500',
            overallStatus === 'degraded' && 'text-amber-500',
            overallStatus === 'down' && 'text-destructive'
          )}>
            {overallStatus === 'operational' ? 'All Systems Operational' :
             overallStatus === 'degraded' ? 'Partial Service Disruption' :
             'Major Service Outage'}
          </h2>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Services */}
        <div className="space-y-3">
          {services.map((service) => (
            <div
              key={service.name}
              className="flex items-center justify-between p-4 bg-card border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="text-muted-foreground">
                  {getServiceIcon(service.name)}
                </div>
                <div>
                  <p className="font-medium">{service.name}</p>
                  {service.message && (
                    <p className="text-xs text-muted-foreground">{service.message}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-sm capitalize',
                  service.status === 'operational' && 'text-emerald-500',
                  service.status === 'degraded' && 'text-amber-500',
                  service.status === 'down' && 'text-destructive'
                )}>
                  {service.status}
                </span>
                {getStatusIcon(service.status)}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Status updates every 30 seconds</p>
          {user && (
            <p className="mt-2">
              <Link href="/" className="text-primary hover:underline">
                Return to PulseWeave
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
