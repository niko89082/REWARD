import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { buildServer } from '../../src/server.js';
import { closeRedis } from '../../src/services/redis.js';
import { ledgerService } from '../../src/services/ledger.js';
import { redemptionService } from '../../src/services/redemption.js';
import { seedDevData } from '../helpers/seed.js';

const prisma = new PrismaClient();

const uniq = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const uniqPhone = () => {
  const n = Math.floor(100000000 + Math.random() * 900000000);
  return `+1555${n}`;
};

describe('POST /square/webhook', () => {
  let fastify;
  let businessId;
  let userId;
  let squareCustomerId;
  let locationId;
  let paymentId;
  let eventId;
  let rewardProgramId;
  let rewardId;

  beforeAll(async () => {
    // Mock Square client (not used for webhooks, but required by buildServer)
    const mockSquareClient = {
      exchangeCodeForToken: async () => {
        throw new Error('Not mocked');
      },
      getMerchantAndLocations: async () => {
        throw new Error('Not mocked');
      },
      retrievePayment: async () => {
        throw new Error('Not mocked');
      },
      retrieveOrder: async () => {
        throw new Error('Not mocked');
      },
    };

    fastify = await buildServer({ squareClient: mockSquareClient });
    await fastify.ready();

    // Seed data
    const seedBody = await seedDevData(fastify);
    businessId = seedBody.businessId;
    userId = seedBody.userId;
    rewardId = seedBody.rewardIds?.[0];

    // Get rewardProgramId from database
    const rewardProgram = await prisma.rewardProgram.findFirst({
      where: {
        businessId,
        earnType: 'POINTS_PER_DOLLAR',
        enabled: true,
      },
    });
    rewardProgramId = rewardProgram?.id;

    // Set up Square location ID
    locationId = `LOC_${crypto.randomUUID()}`;
    await prisma.business.update({
      where: { id: businessId },
      data: {
        squareLocationId: locationId,
        squareAccessToken: 'test-access-token',
      },
    });

    // Create UserSquareLink
    squareCustomerId = `CUSTOMER_${crypto.randomUUID()}`;
    await prisma.userSquareLink.create({
      data: {
        userId,
        businessId,
        squareCustomerId,
      },
    });

    paymentId = `PAYMENT_${crypto.randomUUID()}`;
    eventId = `EVENT_${crypto.randomUUID()}`;
  });

  afterAll(async () => {
    try {
      if (businessId) {
        await prisma.externalEvent.deleteMany({ where: { businessId } }).catch(() => {});
        await prisma.ledgerEvent.deleteMany({ where: { businessId } }).catch(() => {});
        await prisma.userSquareLink.deleteMany({ where: { businessId } }).catch(() => {});
        await prisma.redemption.deleteMany({ where: { businessId } }).catch(() => {});
        await prisma.reward.deleteMany({ where: { businessId } }).catch(() => {});
        await prisma.rewardProgram.deleteMany({ where: { businessId } }).catch(() => {});
        await prisma.business.delete({ where: { id: businessId } }).catch(() => {});
      }
      if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      if (fastify) await fastify.close().catch(() => {});
      await closeRedis().catch(() => {});
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  });

  // Helper to create webhook payload
  const createWebhookPayload = (overrides = {}) => {
    return {
      event_id: eventId,
      type: 'payment.updated',
      data: {
        object: {
          payment: {
            id: paymentId,
            status: 'COMPLETED',
            location_id: locationId,
            customer_id: squareCustomerId,
            amount_money: {
              amount: 2000, // $20.00
            },
            order_id: null,
            ...overrides.payment || {},
          },
        },
      },
      ...overrides,
    };
  };

  // Helper to wait for async processing
  const waitForProcessing = async (ms = 100) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  // Helper to poll until condition is met
  const waitFor = async (fn, { timeoutMs = 5000, intervalMs = 100 } = {}) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const result = await fn();
      if (result) {
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`waitFor timed out after ${timeoutMs}ms`);
  };

  describe('Phase 4: Auto-Earn', () => {
    it('should credit points on COMPLETED payment with linked customer', async () => {
      const initialBalance = await ledgerService.getBalance({ userId, businessId });
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);

      // Wait for async processing
      await waitForProcessing(200);

      // Check balance increased
      const finalBalance = await ledgerService.getBalance({ userId, businessId });
      expect(finalBalance).toBe(initialBalance + 200); // 2000 cents * 0.1 points per dollar = 200 points

      // Check ExternalEvent was created and processed
      const externalEvent = await prisma.externalEvent.findUnique({
        where: {
          provider_externalId: {
            provider: 'SQUARE',
            externalId: newEventId,
          },
        },
      });
      expect(externalEvent).toBeDefined();
      expect(externalEvent.status).toBe('PROCESSED');
    });

    it('should be idempotent - calling webhook twice with same event_id should only credit once', async () => {
      const initialBalance = await ledgerService.getBalance({ userId, businessId });
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      // First call
      const response1 = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });
      expect(response1.statusCode).toBe(200);
      await waitForProcessing(200);

      const balanceAfterFirst = await ledgerService.getBalance({ userId, businessId });

      // Second call with same event_id
      const response2 = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });
      expect(response2.statusCode).toBe(200);
      await waitForProcessing(200);

      const balanceAfterSecond = await ledgerService.getBalance({ userId, businessId });

      // Balance should not change on second call
      expect(balanceAfterSecond).toBe(balanceAfterFirst);
      expect(balanceAfterSecond).toBe(initialBalance + 200);
    });

    it('should not credit points when payment status is not COMPLETED', async () => {
      const initialBalance = await ledgerService.getBalance({ userId, businessId });
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'PENDING',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      expect(response.statusCode).toBe(200);
      await waitForProcessing(200);

      const finalBalance = await ledgerService.getBalance({ userId, businessId });
      expect(finalBalance).toBe(initialBalance);

      // Event should be marked as PROCESSED (no-op)
      const externalEvent = await prisma.externalEvent.findUnique({
        where: {
          provider_externalId: {
            provider: 'SQUARE',
            externalId: newEventId,
          },
        },
      });
      expect(externalEvent.status).toBe('PROCESSED');
    });

    it('should mark event as FAILED when location_id does not match any business', async () => {
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;
      const unknownLocationId = `UNKNOWN_LOC_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: unknownLocationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      expect(response.statusCode).toBe(200);
      await waitForProcessing(200);

      const externalEvent = await prisma.externalEvent.findUnique({
        where: {
          provider_externalId: {
            provider: 'SQUARE',
            externalId: newEventId,
          },
        },
      });
      expect(externalEvent.status).toBe('FAILED');
      expect(externalEvent.errorMessage).toBe('business_not_found');
    });

    it('should not credit points when customer_id is missing', async () => {
      const initialBalance = await ledgerService.getBalance({ userId, businessId });
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: null,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      expect(response.statusCode).toBe(200);
      await waitForProcessing(200);

      const finalBalance = await ledgerService.getBalance({ userId, businessId });
      expect(finalBalance).toBe(initialBalance);

      const externalEvent = await prisma.externalEvent.findUnique({
        where: {
          provider_externalId: {
            provider: 'SQUARE',
            externalId: newEventId,
          },
        },
      });
      expect(externalEvent.status).toBe('PROCESSED');
    });

    it('should not credit points when no matching UserSquareLink exists', async () => {
      const initialBalance = await ledgerService.getBalance({ userId, businessId });
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;
      const unlinkedCustomerId = `UNLINKED_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: unlinkedCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      expect(response.statusCode).toBe(200);
      await waitForProcessing(200);

      const finalBalance = await ledgerService.getBalance({ userId, businessId });
      expect(finalBalance).toBe(initialBalance);

      const externalEvent = await prisma.externalEvent.findUnique({
        where: {
          provider_externalId: {
            provider: 'SQUARE',
            externalId: newEventId,
          },
        },
      });
      expect(externalEvent.status).toBe('PROCESSED');
    });

    it('should respect minSubtotalCents - no points if amount below minimum', async () => {
      if (!rewardProgramId) {
        // Skip if reward program not found
        return;
      }

      // Update reward program to have minSubtotalCents > 2000
      await prisma.rewardProgram.update({
        where: { id: rewardProgramId },
        data: {
          earnParamsJson: {
            version: 1,
            pointsPerDollar: 10,
            rounding: 'FLOOR',
            minSubtotalCents: 5000, // $50.00 minimum
          },
        },
      });

      const initialBalance = await ledgerService.getBalance({ userId, businessId });
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 }, // $20.00, below $50.00 minimum
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      expect(response.statusCode).toBe(200);
      await waitForProcessing(200);

      const finalBalance = await ledgerService.getBalance({ userId, businessId });
      expect(finalBalance).toBe(initialBalance);

      // Reset minSubtotalCents for other tests
      if (rewardProgramId) {
        await prisma.rewardProgram.update({
          where: { id: rewardProgramId },
          data: {
            earnParamsJson: {
              version: 1,
              pointsPerDollar: 10,
              rounding: 'FLOOR',
              minSubtotalCents: 0,
            },
          },
        });
      }
    });

    it('should verify ExternalEvent lifecycle transitions', async () => {
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      expect(response.statusCode).toBe(200);
      await waitForProcessing(200);

      const externalEvent = await prisma.externalEvent.findUnique({
        where: {
          provider_externalId: {
            provider: 'SQUARE',
            externalId: newEventId,
          },
        },
      });

      expect(externalEvent).toBeDefined();
      expect(externalEvent.provider).toBe('SQUARE');
      expect(externalEvent.eventType).toBe('payment.updated');
      expect(externalEvent.status).toBe('PROCESSED');
      expect(externalEvent.processedAt).toBeDefined();
      expect(externalEvent.payloadJson).toBeDefined();
    });

    it('should process webhook successfully when signature verification is disabled', async () => {
      const initialBalance = await ledgerService.getBalance({ userId, businessId });
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      expect(response.statusCode).toBe(200);
      await waitForProcessing(200);

      const finalBalance = await ledgerService.getBalance({ userId, businessId });
      expect(finalBalance).toBeGreaterThan(initialBalance);
    });
  });

  describe('Phase 5: Auto-Confirm', () => {
    it('should auto-confirm redemption when payment completes for linked customer', async () => {
      if (!rewardId) {
        // Skip if reward not found
        return;
      }

      // Seed points
      await ledgerService.createEarn({
        userId,
        businessId,
        points: 1000,
        metadata: { source: 'test' },
      });

      const initialBalance = await ledgerService.getBalance({ userId, businessId });
      expect(initialBalance).toBeGreaterThanOrEqual(1000);

      // Create redemption
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/redeem/create',
        payload: {
          userId,
          businessId,
          rewardId,
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const redemptionId = createBody.redemptionId;

      // Verify token to move to IN_PROGRESS
      await fastify.inject({
        method: 'POST',
        url: '/merchant/verify',
        payload: {
          businessId,
          token: createBody.token,
        },
      });

      // Verify redemption is IN_PROGRESS
      const redemptionBefore = await prisma.redemption.findUnique({
        where: { id: redemptionId },
      });
      expect(redemptionBefore.status).toBe('IN_PROGRESS');

      // Send webhook with COMPLETED payment
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      expect(response.statusCode).toBe(200);
      await waitForProcessing(300);

      // Check redemption is CONFIRMED
      const redemptionAfter = await prisma.redemption.findUnique({
        where: { id: redemptionId },
      });
      expect(redemptionAfter.status).toBe('CONFIRMED');
      expect(redemptionAfter.providerPaymentId).toBe(newPaymentId);
      expect(redemptionAfter.confirmedAt).toBeDefined();

      // Check balance was deducted
      const finalBalance = await ledgerService.getBalance({ userId, businessId });
      const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
      expect(finalBalance).toBe(initialBalance - reward.costPoints + 200); // Earned 200, deducted reward cost
    });

    it('should deterministically auto-confirm oldest redemption when there are multiple IN_PROGRESS redemptions', async () => {
      if (!rewardId) {
        // Skip if reward not found
        return;
      }

      // Seed points
      await ledgerService.createEarn({
        userId,
        businessId,
        points: 2000,
        metadata: { source: 'test' },
      });

      // Create two redemptions
      const create1 = await fastify.inject({
        method: 'POST',
        url: '/redeem/create',
        payload: {
          userId,
          businessId,
          rewardId,
        },
      });
      const create2 = await fastify.inject({
        method: 'POST',
        url: '/redeem/create',
        payload: {
          userId,
          businessId,
          rewardId,
        },
      });

      const redemptionId1 = JSON.parse(create1.body).redemptionId;
      const redemptionId2 = JSON.parse(create2.body).redemptionId;

      // Verify both to IN_PROGRESS
      await fastify.inject({
        method: 'POST',
        url: '/merchant/verify',
        payload: {
          businessId,
          token: JSON.parse(create1.body).token,
        },
      });
      await fastify.inject({
        method: 'POST',
        url: '/merchant/verify',
        payload: {
          businessId,
          token: JSON.parse(create2.body).token,
        },
      });

      // Send webhook
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      await waitForProcessing(300);

      // Oldest redemption (redemptionId1) should be CONFIRMED, other should remain IN_PROGRESS
      const redemption1 = await prisma.redemption.findUnique({
        where: { id: redemptionId1 },
      });
      const redemption2 = await prisma.redemption.findUnique({
        where: { id: redemptionId2 },
      });

      // Deterministic selection: oldest redemption (created first) should be confirmed
      expect(redemption1.status).toBe('CONFIRMED');
      expect(redemption1.providerPaymentId).toBe(newPaymentId);
      expect(redemption2.status).toBe('IN_PROGRESS');
    });

    it('should not auto-confirm expired redemption', async () => {
      if (!rewardId) {
        // Skip if reward not found
        return;
      }

      // Seed points
      await ledgerService.createEarn({
        userId,
        businessId,
        points: 1000,
        metadata: { source: 'test' },
      });

      // Create redemption
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/redeem/create',
        payload: {
          userId,
          businessId,
          rewardId,
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const redemptionId = createBody.redemptionId;

      // Verify to IN_PROGRESS
      await fastify.inject({
        method: 'POST',
        url: '/merchant/verify',
        payload: {
          businessId,
          token: createBody.token,
        },
      });

      // Manually expire the redemption
      await prisma.redemption.update({
        where: { id: redemptionId },
        data: {
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });

      // Send webhook
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      await waitForProcessing(300);

      // Redemption should still be IN_PROGRESS (not auto-confirmed due to expiration)
      const redemption = await prisma.redemption.findUnique({
        where: { id: redemptionId },
      });
      expect(redemption.status).toBe('IN_PROGRESS');
    });

    it('should be idempotent - webhook called twice should only confirm once', async () => {
      if (!rewardId) {
        // Skip if reward not found
        return;
      }

      // Seed points
      await ledgerService.createEarn({
        userId,
        businessId,
        points: 1000,
        metadata: { source: 'test' },
      });

      // Create redemption
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/redeem/create',
        payload: {
          userId,
          businessId,
          rewardId,
        },
      });
      const createBody = JSON.parse(createResponse.body);
      const redemptionId = createBody.redemptionId;

      // Verify to IN_PROGRESS
      await fastify.inject({
        method: 'POST',
        url: '/merchant/verify',
        payload: {
          businessId,
          token: createBody.token,
        },
      });

      const newEventId1 = `EVENT_${crypto.randomUUID()}`;
      const newEventId2 = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload1 = createWebhookPayload({
        event_id: newEventId1,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      // First webhook call
      await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload: payload1,
      });
      
      // Wait for redemption to be confirmed
      const redemptionAfterFirst = await waitFor(
        async () => {
          const redemption = await prisma.redemption.findUnique({
            where: { id: redemptionId },
          });
          return redemption?.status === 'CONFIRMED' ? redemption : null;
        },
        { timeoutMs: 15000, intervalMs: 100 }
      );
      expect(redemptionAfterFirst.status).toBe('CONFIRMED');

      // Second webhook call with different event_id but same payment (should not double-confirm)
      const payload2 = createWebhookPayload({
        event_id: newEventId2,
        data: {
          object: {
            payment: {
              id: newPaymentId, // Same payment ID
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload: payload2,
      });
      await waitForProcessing(300);

      // Should still be CONFIRMED (idempotent)
      const redemptionAfterSecond = await prisma.redemption.findUnique({
        where: { id: redemptionId },
      });
      expect(redemptionAfterSecond.status).toBe('CONFIRMED');
    }, 20000);

    it('should award points even when no redemption to auto-confirm', async () => {
      const initialBalance = await ledgerService.getBalance({ userId, businessId });
      const newEventId = `EVENT_${crypto.randomUUID()}`;
      const newPaymentId = `PAYMENT_${crypto.randomUUID()}`;

      const payload = createWebhookPayload({
        event_id: newEventId,
        data: {
          object: {
            payment: {
              id: newPaymentId,
              status: 'COMPLETED',
              location_id: locationId,
              customer_id: squareCustomerId,
              amount_money: { amount: 2000 },
            },
          },
        },
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/square/webhook',
        payload,
      });

      expect(response.statusCode).toBe(200);
      await waitForProcessing(200);

      // Points should still be awarded
      const finalBalance = await ledgerService.getBalance({ userId, businessId });
      expect(finalBalance).toBe(initialBalance + 200);
    });
  });
});
