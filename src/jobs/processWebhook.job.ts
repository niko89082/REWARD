import { createWorker } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { processWebhookEvent } from '../services/transaction.service';
import { POSProvider, WebhookStatus } from '@prisma/client';

interface WebhookJobData {
  webhookLogId: string;
  payload: any;
}

/**
 * Process webhook job worker
 */
export function startWebhookWorker() {
  const worker = createWorker<WebhookJobData>(
    'webhook-processing',
    async (job) => {
      const { webhookLogId, payload } = job.data;

      try {
        logger.info({ webhookLogId, eventType: payload.type }, 'Processing webhook job');

        // Update webhook log status
        await prisma.webhookLog.update({
          where: { id: webhookLogId },
          data: { status: WebhookStatus.PROCESSED },
        });

        // Determine provider from payload or default to SQUARE
        const provider = POSProvider.SQUARE; // Can be extended to detect from payload

        // Process webhook event
        await processWebhookEvent(provider, payload);

        logger.info({ webhookLogId }, 'Webhook job completed');
      } catch (error) {
        logger.error({ error, webhookLogId }, 'Webhook job failed');

        // Update webhook log with error
        await prisma.webhookLog.update({
          where: { id: webhookLogId },
          data: {
            status: WebhookStatus.FAILED,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            processedAt: new Date(),
          },
        });

        throw error; // Re-throw to trigger retry
      }
    }
  );

  logger.info('Webhook worker started');
  return worker;
}
