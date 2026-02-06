import { createQueue } from './src/lib/redis.js';

const queue = createQueue('webhook-processing');

console.log('Adding test job...');

await queue.add('process-webhook', {
  webhookLogId: 'test-id',
  payload: { test: true }
});

console.log('✅ Job added to queue');

// Check queue
const jobCounts = await queue.getJobCounts();
console.log('Queue status:', jobCounts);

process.exit(0);
