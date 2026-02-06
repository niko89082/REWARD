import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../config.js';
import { squareWebhookService } from '../services/squareWebhookService.js';

const prisma = new PrismaClient();
const config = loadConfig();

async function squareWebhookRoutes(fastify) {
  /**
   * POST /square/webhook
   * Receives Square webhook events and processes them.
   *
   * Always returns 200 to prevent Square retry storms.
   *
   * In production/dev: process async (fire-and-forget).
   * In test: process synchronously to avoid race conditions in Jest.
   *
   * Note: For signature verification, raw body is needed. Currently using parsed body.
   * TODO: Implement raw body capture for HMAC-SHA256 signature verification.
   */
  fastify.post('/square/webhook', async (request, reply) => {
    // Signature verification (placeholder)
    if (config.SQUARE_WEBHOOK_VERIFY === true) {
      fastify.log.warn('Webhook signature verification not implemented');
    }

    // Parse payload
    let payload;
    try {
      payload = request.body;
      if (!payload || typeof payload !== 'object') {
        fastify.log.warn('Webhook payload is not a valid object');
        return { ok: true };
      }
    } catch (err) {
      fastify.log.error({ err }, 'Failed to parse webhook payload');
      return { ok: true };
    }

    // Extract externalId
    const externalId = payload.event_id || payload.id || payload.data?.id;
    if (!externalId) {
      fastify.log.warn('Webhook payload missing event_id');
      return { ok: true };
    }

    // Extract eventType
    const eventType = payload.type || payload.event_type || 'unknown';

    // Upsert ExternalEvent (idempotent)
    let externalEvent;
    try {
      externalEvent = await prisma.externalEvent.upsert({
        where: {
          provider_externalId: {
            provider: 'SQUARE',
            externalId: String(externalId),
          },
        },
        create: {
          provider: 'SQUARE',
          eventType,
          externalId: String(externalId),
          status: 'RECEIVED',
          payloadJson: payload,
        },
        update: {}, // do not overwrite payload/status on duplicates
      });
    } catch (err) {
      fastify.log.error({ err }, 'Failed to upsert ExternalEvent');
      return { ok: true };
    }

    // If already processed/failed, idempotent success
    if (externalEvent.status !== 'RECEIVED') {
      return { ok: true };
    }

    // ✅ Critical fix for Jest determinism:
    // In tests, process synchronously so assertions see DB updates immediately.
    if (process.env.NODE_ENV === 'test') {
      try {
        await squareWebhookService.processEvent(externalEvent.id);
      } catch (err) {
        // Service is supposed to never throw, but keep this extra safety:
        fastify.log.error({ err }, 'Error processing webhook event (test mode)');
      }
      return { ok: true };
    }

    // In non-test envs: fire-and-forget
    squareWebhookService.processEvent(externalEvent.id).catch((err) => {
      fastify.log.error({ err }, 'Error processing webhook event');
    });

    return { ok: true };
  });
}

export default squareWebhookRoutes;