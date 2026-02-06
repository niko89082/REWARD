import { Redis } from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { logger } from './logger';
import { env } from '../config/env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (error) => {
  logger.error({ error }, 'Redis connection error');
});

export function createQueue<T = any>(name: string): Queue<T> {
  return new Queue<T>(name, {
    connection: redis,
  });
}

export function createWorker<T = any>(
  name: string,
  processor: (job: any) => Promise<void>
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    connection: redis.duplicate(),
  });
  
  worker.on('ready', () => {
    logger.info({ queue: name }, 'Worker ready');
  });
  
  worker.on('active', (job) => {
    logger.info({ queue: name, jobId: job.id }, 'Job active');
  });
  
  worker.on('completed', (job) => {
    logger.info({ queue: name, jobId: job.id }, 'Job completed');
  });
  
  worker.on('failed', (job, err) => {
    logger.error({ queue: name, jobId: job?.id, error: err }, 'Job failed');
  });
  
  return worker;
}

export function createQueueEvents(name: string): QueueEvents {
  return new QueueEvents(name, {
    connection: redis.duplicate(),
  });
}

export const webhookQueue = createQueue('webhook-processing');
