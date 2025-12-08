'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Database,
  Cpu,
  HardDrive,
  Wifi,
  Clock,
  Activity,
  Server,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9090';

interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  message?: string;
}

interface MemoryHealth {
  status: 'healthy' | 'warning' | 'critical';
  used: number;
  total: number;
  percentage: number;
}

interface CpuHealth {
  status: 'healthy' | 'warning' | 'critical';
  load: number[];
  percentage: number;
}

interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  duration: number;
  message?: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceHealth;
    websocket: ServiceHealth;
    memory: MemoryHealth;
    cpu: CpuHealth;
  };
  checks: HealthCheck[];
}

interface Metrics {
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  cpu: {
    load1m: number;
    load5m: number;
    load15m: number;
  };
  websocket: number;
}

export default function HealthPage() {
  const router = useRouter();
  const { token, user } = useStore();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/health`, {
        headers: { 'Accept': 'application/json' },
      });
      const data = await response.json();
      setHealth(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch health status');
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/metrics`, {
        headers: { 'Accept': 'text/plain' },
      });
      const text = await response.text();
      
      // Parse Prometheus-style metrics
      const lines = text.split('\n');
      const parsed: Metrics = {
        uptime: 0,
        memory: { heapUsed: 0, heapTotal: 0, rss: 0 },
        cpu: { load1m: 0, load5m: 0, load15m: 0 },
        websocket: 0,
      };
      
      lines.forEach((line) => {
        if (line.startsWith('pulseweave_uptime_seconds')) {
          parsed.uptime = parseFloat(line.split(' ')[1]) || 0;
        } else if (line.startsWith('pulseweave_memory_heap_used_bytes')) {
          parsed.memory.heapUsed = parseFloat(line.split(' ')[1]) || 0;
        } else if (line.startsWith('pulseweave_memory_heap_total_bytes')) {
          parsed.memory.heapTotal = parseFloat(line.split(' ')[1]) || 0;
        } else if (line.startsWith('pulseweave_memory_rss_bytes')) {
          parsed.memory.rss = parseFloat(line.split(' ')[1]) || 0;
        } else if (line.includes('period="1m"')) {
          parsed.cpu.load1m = parseFloat(line.split(' ')[1]) || 0;
        } else if (line.includes('period="5m"')) {
          parsed.cpu.load5m = parseFloat(line.split(' ')[1]) || 0;
        } else if (line.includes('period="15m"')) {
          parsed.cpu.load15m = parseFloat(line.split(' ')[1]) || 0;
        } else if (line.startsWith('pulseweave_websocket_connections')) {
          parsed.websocket = parseFloat(line.split(' ')[1]) || 0;
        }
      });
      
      setMetrics(parsed);
    } catch {
      // Metrics endpoint might not be available
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchHealth(), fetchMetrics()]);
    setRefreshing(false);
  }, [fetchHealth, fetchMetrics]);

  useEffect(() => {
    // Check if user is admin/owner
    if (!token || !user) {
      router.push('/login');
      return;
    }

    // Initial fetch
    setLoading(true);
    Promise.all([fetchHealth(), fetchMetrics()]).finally(() => setLoading(false));

    // Auto-refresh every 10 seconds
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(refresh, 10000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [token, user, router, fetchHealth, fetchMetrics, refresh, autoRefresh]);

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatBytes = (bytes: number): string => {
    const mb = bytes / 1024 / 1024;
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'up':
      case 'pass':
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'degraded':
      case 'warn':
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default:
        return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'up':
      case 'pass':
        return 'text-emerald-500';
      case 'degraded':
      case 'warn':
      case 'warning':
        return 'text-amber-500';
      default:
        return 'text-destructive';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading health status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Activity className="w-6 h-6 text-primary" />
                  System Health
                </h1>
                <p className="text-sm text-muted-foreground">
                  Real-time server status and metrics
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                Auto-refresh
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={refreshing}
              >
                <RefreshCw className={cn('w-4 h-4 mr-2', refreshing && 'animate-spin')} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
            {error}
          </div>
        )}

        {/* Overall Status */}
        {health && (
          <div className="mb-8">
            <div className={cn(
              'p-6 rounded-xl border-2',
              health.status === 'healthy' && 'bg-emerald-500/5 border-emerald-500/20',
              health.status === 'degraded' && 'bg-amber-500/5 border-amber-500/20',
              health.status === 'unhealthy' && 'bg-destructive/5 border-destructive/20'
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {getStatusIcon(health.status)}
                  <div>
                    <h2 className={cn('text-xl font-bold capitalize', getStatusColor(health.status))}>
                      {health.status === 'healthy' ? 'All Systems Operational' : 
                       health.status === 'degraded' ? 'Partial Degradation' : 'Service Disruption'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Last checked: {new Date(health.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Version</p>
                  <p className="font-mono">{health.version}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground">Uptime</span>
            </div>
            <p className="text-2xl font-bold">{formatUptime(health?.uptime || 0)}</p>
          </div>
          
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <HardDrive className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground">Memory</span>
            </div>
            <p className="text-2xl font-bold">
              {health?.services.memory.percentage || 0}%
            </p>
            <p className="text-xs text-muted-foreground">
              {formatBytes((metrics?.memory.heapUsed || 0))} / {formatBytes((metrics?.memory.heapTotal || 0))}
            </p>
          </div>
          
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Cpu className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground">CPU Load</span>
            </div>
            <p className="text-2xl font-bold">
              {health?.services.cpu.percentage || 0}%
            </p>
            <p className="text-xs text-muted-foreground">
              {metrics?.cpu.load1m.toFixed(2)} / {metrics?.cpu.load5m.toFixed(2)} / {metrics?.cpu.load15m.toFixed(2)}
            </p>
          </div>
          
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Wifi className="w-5 h-5 text-primary" />
              <span className="text-sm text-muted-foreground">WebSocket</span>
            </div>
            <p className="text-2xl font-bold">{metrics?.websocket || 0}</p>
            <p className="text-xs text-muted-foreground">Active connections</p>
          </div>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Database */}
          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Database</h3>
              </div>
              {health && getStatusIcon(health.services.database.status)}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className={cn('capitalize', getStatusColor(health?.services.database.status || 'down'))}>
                  {health?.services.database.status || 'Unknown'}
                </span>
              </div>
              {health?.services.database.latency !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Latency</span>
                  <span>{health.services.database.latency}ms</span>
                </div>
              )}
              {health?.services.database.message && (
                <p className="text-xs text-muted-foreground mt-2">
                  {health.services.database.message}
                </p>
              )}
            </div>
          </div>

          {/* WebSocket */}
          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Server className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">WebSocket Server</h3>
              </div>
              {health && getStatusIcon(health.services.websocket.status)}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className={cn('capitalize', getStatusColor(health?.services.websocket.status || 'down'))}>
                  {health?.services.websocket.status || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Connections</span>
                <span>{metrics?.websocket || 0}</span>
              </div>
              {health?.services.websocket.message && (
                <p className="text-xs text-muted-foreground mt-2">
                  {health.services.websocket.message}
                </p>
              )}
            </div>
          </div>

          {/* Memory */}
          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Memory</h3>
              </div>
              {health && getStatusIcon(health.services.memory.status)}
            </div>
            <div className="space-y-3">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all',
                    health?.services.memory.status === 'healthy' && 'bg-emerald-500',
                    health?.services.memory.status === 'warning' && 'bg-amber-500',
                    health?.services.memory.status === 'critical' && 'bg-destructive'
                  )}
                  style={{ width: `${health?.services.memory.percentage || 0}%` }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Heap Used</span>
                <span>{health?.services.memory.used || 0} MB</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Heap Total</span>
                <span>{health?.services.memory.total || 0} MB</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">RSS</span>
                <span>{formatBytes(metrics?.memory.rss || 0)}</span>
              </div>
            </div>
          </div>

          {/* CPU */}
          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">CPU</h3>
              </div>
              {health && getStatusIcon(health.services.cpu.status)}
            </div>
            <div className="space-y-3">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all',
                    health?.services.cpu.status === 'healthy' && 'bg-emerald-500',
                    health?.services.cpu.status === 'warning' && 'bg-amber-500',
                    health?.services.cpu.status === 'critical' && 'bg-destructive'
                  )}
                  style={{ width: `${Math.min(health?.services.cpu.percentage || 0, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Load (1m)</span>
                <span>{metrics?.cpu.load1m.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Load (5m)</span>
                <span>{metrics?.cpu.load5m.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Load (15m)</span>
                <span>{metrics?.cpu.load15m.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Health Checks */}
        {health?.checks && health.checks.length > 0 && (
          <div className="bg-card border rounded-xl p-6">
            <h3 className="font-semibold mb-4">Health Checks</h3>
            <div className="space-y-3">
              {health.checks.map((check) => (
                <div
                  key={check.name}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(check.status)}
                    <div>
                      <p className="font-medium capitalize">{check.name}</p>
                      {check.message && (
                        <p className="text-xs text-muted-foreground">{check.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-sm capitalize', getStatusColor(check.status))}>
                      {check.status}
                    </p>
                    <p className="text-xs text-muted-foreground">{check.duration}ms</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Endpoints */}
        <div className="mt-8 bg-card border rounded-xl p-6">
          <h3 className="font-semibold mb-4">API Endpoints</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-mono text-primary">/health</p>
              <p className="text-muted-foreground">Full health status</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-mono text-primary">/health/live</p>
              <p className="text-muted-foreground">Liveness probe (K8s)</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-mono text-primary">/health/ready</p>
              <p className="text-muted-foreground">Readiness probe (K8s)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
