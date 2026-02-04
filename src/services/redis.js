import Redis from 'ioredis';
import { loadConfig } from '../config.js';

let redisClient = null;

/**
 * Get or create the singleton Redis client.
 * Lazy initialization - only creates connection when first called.
 */
export function getRedis() {
  if (redisClient) {
    return redisClient;
  }

  const config = loadConfig();
  
  // In test mode, REDIS_URL might be empty, but we still try to connect
  // The connection will fail gracefully if Redis is not available
  const redisUrl = config.REDIS_URL || 'redis://localhost:6379';
  
  try {
    redisClient = new Redis(redisUrl, {
      retryStrategy: (times) => {
        // Exponential backoff, max 3 seconds
        const delay = Math.min(times * 50, 3000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    redisClient.on('error', (err) => {
      // Log error but don't crash - let callers handle connection issues
      console.error('Redis connection error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('Redis connected');
    });
  } catch (err) {
    // Handle connection errors gracefully
    console.error('Failed to create Redis client:', err.message);
    // Return null or throw based on your error handling strategy
    // For now, we'll let it throw so callers know Redis is unavailable
    throw err;
  }

  return redisClient;
}

/**
 * Close the Redis connection and reset the singleton.
 * Useful for tests and graceful shutdown.
 */
export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
