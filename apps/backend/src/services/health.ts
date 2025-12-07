import { prisma } from '@pulseweave/database';
import { logger } from '../utils/logger';
import os from 'os';

/**
 * Health check status.
 */
export interface HealthStatus {
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

// Track server start time
const startTime = Date.now();

// Track WebSocket connection count
let wsConnectionCount = 0;

/**
 * Updates the WebSocket connection count.
 */
export function updateWsConnectionCount(count: number): void {
  wsConnectionCount = count;
}

/**
 * Checks database connectivity and latency.
 */
async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    
    return {
      status: latency > 1000 ? 'degraded' : 'up',
      latency,
      message: latency > 1000 ? 'High latency detected' : undefined,
    };
  } catch (error) {
    return {
      status: 'down',
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

/**
 * Checks memory usage.
 */
function checkMemory(): MemoryHealth {
  const used = process.memoryUsage();
  const heapUsed = used.heapUsed;
  const heapTotal = used.heapTotal;
  const percentage = (heapUsed / heapTotal) * 100;

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (percentage > 90) status = 'critical';
  else if (percentage > 75) status = 'warning';

  return {
    status,
    used: Math.round(heapUsed / 1024 / 1024), // MB
    total: Math.round(heapTotal / 1024 / 1024), // MB
    percentage: Math.round(percentage),
  };
}

/**
 * Checks CPU usage.
 */
function checkCpu(): CpuHealth {
  const load = os.loadavg();
  const cpuCount = os.cpus().length;
  const percentage = (load[0] / cpuCount) * 100;

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (percentage > 90) status = 'critical';
  else if (percentage > 70) status = 'warning';

  return {
    status,
    load,
    percentage: Math.round(percentage),
  };
}

/**
 * Runs all health checks and returns comprehensive status.
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const checks: HealthCheck[] = [];
  const timestamp = new Date().toISOString();
  const uptime = Math.round((Date.now() - startTime) / 1000);

  // Database check
  const dbStart = Date.now();
  const database = await checkDatabase();
  checks.push({
    name: 'database',
    status: database.status === 'up' ? 'pass' : database.status === 'degraded' ? 'warn' : 'fail',
    duration: Date.now() - dbStart,
    message: database.message,
  });

  // Memory check
  const memory = checkMemory();
  checks.push({
    name: 'memory',
    status: memory.status === 'healthy' ? 'pass' : memory.status === 'warning' ? 'warn' : 'fail',
    duration: 0,
    message: memory.status !== 'healthy' ? `Memory usage at ${memory.percentage}%` : undefined,
  });

  // CPU check
  const cpu = checkCpu();
  checks.push({
    name: 'cpu',
    status: cpu.status === 'healthy' ? 'pass' : cpu.status === 'warning' ? 'warn' : 'fail',
    duration: 0,
    message: cpu.status !== 'healthy' ? `CPU load at ${cpu.percentage}%` : undefined,
  });

  // WebSocket check
  const websocket: ServiceHealth = {
    status: 'up',
    message: `${wsConnectionCount} active connections`,
  };
  checks.push({
    name: 'websocket',
    status: 'pass',
    duration: 0,
  });

  // Determine overall status
  const hasFailure = checks.some((c) => c.status === 'fail');
  const hasWarning = checks.some((c) => c.status === 'warn');
  const status = hasFailure ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy';

  return {
    status,
    timestamp,
    uptime,
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database,
      websocket,
      memory,
      cpu,
    },
    checks,
  };
}

/**
 * Simple liveness check (is the server running?).
 */
export function getLivenessStatus(): { status: 'ok'; timestamp: string } {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Readiness check (is the server ready to accept traffic?).
 */
export async function getReadinessStatus(): Promise<{
  ready: boolean;
  timestamp: string;
  checks: { name: string; ready: boolean }[];
}> {
  const database = await checkDatabase();
  
  const checks = [
    { name: 'database', ready: database.status !== 'down' },
  ];

  return {
    ready: checks.every((c) => c.ready),
    timestamp: new Date().toISOString(),
    checks,
  };
}

/**
 * Metrics for monitoring systems (Prometheus-compatible format).
 */
export function getMetrics(): string {
  const memory = process.memoryUsage();
  const uptime = Math.round((Date.now() - startTime) / 1000);
  const load = os.loadavg();

  const metrics = [
    `# HELP pulseweave_uptime_seconds Server uptime in seconds`,
    `# TYPE pulseweave_uptime_seconds gauge`,
    `pulseweave_uptime_seconds ${uptime}`,
    '',
    `# HELP pulseweave_memory_heap_used_bytes Heap memory used`,
    `# TYPE pulseweave_memory_heap_used_bytes gauge`,
    `pulseweave_memory_heap_used_bytes ${memory.heapUsed}`,
    '',
    `# HELP pulseweave_memory_heap_total_bytes Total heap memory`,
    `# TYPE pulseweave_memory_heap_total_bytes gauge`,
    `pulseweave_memory_heap_total_bytes ${memory.heapTotal}`,
    '',
    `# HELP pulseweave_memory_rss_bytes Resident set size`,
    `# TYPE pulseweave_memory_rss_bytes gauge`,
    `pulseweave_memory_rss_bytes ${memory.rss}`,
    '',
    `# HELP pulseweave_cpu_load_average CPU load average`,
    `# TYPE pulseweave_cpu_load_average gauge`,
    `pulseweave_cpu_load_average{period="1m"} ${load[0]}`,
    `pulseweave_cpu_load_average{period="5m"} ${load[1]}`,
    `pulseweave_cpu_load_average{period="15m"} ${load[2]}`,
    '',
    `# HELP pulseweave_websocket_connections Active WebSocket connections`,
    `# TYPE pulseweave_websocket_connections gauge`,
    `pulseweave_websocket_connections ${wsConnectionCount}`,
    '',
  ];

  return metrics.join('\n');
}

/**
 * Starts periodic health logging.
 */
export function startHealthLogging(intervalMs: number = 60000): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const health = await getHealthStatus();
      if (health.status !== 'healthy') {
        logger.warn('Health check degraded', {
          status: health.status,
          checks: health.checks.filter((c) => c.status !== 'pass'),
        });
      }
    } catch (error) {
      logger.error('Health check failed', { error: String(error) });
    }
  }, intervalMs);
}
