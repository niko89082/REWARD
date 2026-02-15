import { z } from 'zod';
import { POSProvider, WebhookStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { getPOSProvider } from '../../pos/factory';
import { env } from '../../config/env';
import { createQueue } from '../../lib/redis';
const webhookQueue = createQueue('webhook-processing');
/**
 * Square webhook endpoint
 */
export default async function squareWebhookRoutes(fastify) {
    fastify.post('/webhooks/square', async (request, reply) => {
        try {
            const rawBody = JSON.stringify(request.body);
            const signature = request.headers['x-square-signature'] ||
                request.headers['x-square-hmacsha256-signature'] || '';
            // Skip signature verification in development for local testing
            if (env.NODE_ENV === 'production' && signature) {
                const provider = getPOSProvider(POSProvider.SQUARE);
                const isValid = provider.verifyWebhookSignature(rawBody, signature, env.SQUARE_WEBHOOK_SIGNATURE_KEY);
                if (!isValid) {
                    logger.warn({ signature }, 'Invalid webhook signature');
                    reply.code(401).send({ error: 'Invalid signature' });
                    return;
                }
            }
            else if (env.NODE_ENV === 'development') {
                logger.info('Skipping webhook signature verification in development');
            }
            const payload = request.body;
            // Log webhook
            const webhookLog = await prisma.webhookLog.create({
                data: {
                    provider: POSProvider.SQUARE,
                    eventType: payload.type || 'unknown',
                    payload: payload,
                    signature,
                    status: WebhookStatus.PENDING,
                },
            });
            // Queue for async processing
            await webhookQueue.add('process-square-webhook', {
                webhookLogId: webhookLog.id,
                payload,
            });
            logger.info({ webhookLogId: webhookLog.id, eventType: payload.type }, 'Webhook queued for processing');
            reply.code(200).send({ received: true });
        }
        catch (error) {
            logger.error({ error }, 'Error processing webhook');
            reply.code(500).send({ error: 'Internal server error' });
        }
    });
}
//# sourceMappingURL=square.js.map