/**
 * Memory management utilities.
 * Provides periodic cleanup for in-memory caches to prevent memory leaks.
 */

import { logger } from '../utils/logger';

/**
 * Cache with automatic expiration and size limits.
 */
export class BoundedCache<K, V extends { expiresAt?: number }> {
  private cache = new Map<K, V>();
  private maxSize: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: { maxSize?: number; cleanupIntervalMs?: number } = {}) {
    this.maxSize = options.maxSize || 10000;
    
    // Start periodic cleanup
    if (options.cleanupIntervalMs) {
      this.startCleanup(options.cleanupIntervalMs);
    }
  }

  get(key: K): V | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    
    // Check expiration
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    
    return item;
  }

  set(key: K, value: V): void {
    // Enforce size limit by removing oldest entries
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * Removes all expired entries from the cache.
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, value] of this.cache) {
      if (value.expiresAt && now > value.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    return removed;
  }

  private startCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      const removed = this.cleanup();
      if (removed > 0) {
        logger.debug(`Cache cleanup: removed ${removed} expired entries`);
      }
    }, intervalMs);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Global cleanup for all registered caches.
 */
const registeredCaches: Array<{ name: string; cleanup: () => number }> = [];

/**
 * Registers a cache for global cleanup.
 */
export function registerCacheForCleanup(name: string, cleanupFn: () => number): void {
  registeredCaches.push({ name, cleanup: cleanupFn });
}

/**
 * Runs cleanup on all registered caches.
 */
export function cleanupAllCaches(): void {
  for (const cache of registeredCaches) {
    try {
      const removed = cache.cleanup();
      if (removed > 0) {
        logger.info(`${cache.name} cleanup: removed ${removed} entries`);
      }
    } catch (error) {
      logger.error(`${cache.name} cleanup failed:`, { error: String(error) });
    }
  }
}

// Run global cleanup every 5 minutes
let globalCleanupInterval: NodeJS.Timeout | null = null;

export function startGlobalCleanup(intervalMs = 5 * 60 * 1000): void {
  if (globalCleanupInterval) return;
  
  globalCleanupInterval = setInterval(() => {
    cleanupAllCaches();
  }, intervalMs);
  
  logger.info('Global cache cleanup started');
}

export function stopGlobalCleanup(): void {
  if (globalCleanupInterval) {
    clearInterval(globalCleanupInterval);
    globalCleanupInterval = null;
  }
}
