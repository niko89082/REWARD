import { Redis } from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';
/**
 * Redis connection for BullMQ
 */
export declare const redis: Redis;
/**
 * Connection options for BullMQ
 */
export declare const bullMQConnection: {
    host: string;
    port: number;
    maxRetriesPerRequest: null;
};
/**
 * Create a BullMQ queue
 */
export declare function createQueue<T = any>(name: string): Queue<T>;
/**
 * Create a BullMQ worker
 */
export declare function createWorker<T = any>(name: string, processor: (job: any) => Promise<void>): Worker<T>;
/**
 * Create queue events listener
 */
export declare function createQueueEvents(name: string): QueueEvents;
//# sourceMappingURL=redis.d.ts.map