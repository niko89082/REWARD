import { Redis } from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { logger } from './logger';
import { env } from '../config/env';
/**
 * Redis connection for BullMQ
 */
export const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
});
redis.on('connect', () => {
    logger.info('Redis connected');
});
redis.on('error', (error) => {
    logger.error({ error }, 'Redis connection error');
});
/**
 * Connection options for BullMQ
 */
export const bullMQConnection = {
    host: new URL(env.REDIS_URL).hostname,
    port: parseInt(new URL(env.REDIS_URL).port || '6379'),
    maxRetriesPerRequest: null,
};
/**
 * Create a BullMQ queue
 */
export function createQueue(name) {
    return new Queue(name, {
        connection: bullMQConnection,
    });
}
/**
 * Create a BullMQ worker
 */
export function createWorker(name, processor) {
    return new Worker(name, processor, {
        connection: bullMQConnection,
    });
}
/**
 * Create queue events listener
 */
export function createQueueEvents(name) {
    return new QueueEvents(name, {
        connection: bullMQConnection,
    });
}
//# sourceMappingURL=redis.js.map