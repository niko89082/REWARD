import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import devRoutes from '../../src/routes/dev.js';
import redeemRoutes from '../../src/routes/redeem.js';
import merchantRoutes from '../../src/routes/merchant.js';
import { ledgerService } from '../../src/services/ledger.js';

const prisma = new PrismaClient();

describe('Redeem endpoints', () => {
  let fastify;
  let businessId;
  let userId;
  let rewardId;

  beforeAll(async () => {
    fastify = Fastify();
    await fastify.register(devRoutes);
    await fastify.register(redeemRoutes);
    await fastify.register(merchantRoutes);
    await fastify.ready();

    // Seed data
    const seedResponse = await fastify.inject({
      method: 'POST',
      url: '/dev/seed',
    });
    const seedBody = JSON.parse(seedResponse.body);
    businessId = seedBody.businessId;
    userId = seedBody.userId;
    rewardId = seedBody.rewardIds[0]; // FREE_ITEM reward
  });

  afterAll(async () => {
    await fastify.close();
    await prisma.redemption.deleteMany({ where: { userId, businessId } });
    await prisma.ledgerEvent.deleteMany({ where: { userId, businessId } });
    await prisma.reward.deleteMany({ where: { businessId } });
    await prisma.rewardProgram.deleteMany({ where: { businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('should create redemption and return token', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/redeem/create',
      payload: {
        userId,
        businessId,
        rewardId,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.redemptionId).toBeDefined();
    expect(body.token).toBeDefined();
    expect(body.expiresAt).toBeDefined();
  });

  it('should confirm redemption', async () => {
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

    // Verify token
    await fastify.inject({
      method: 'POST',
      url: '/merchant/verify',
      payload: {
        businessId,
        token: createBody.token,
      },
    });

    // Confirm
    const confirmResponse = await fastify.inject({
      method: 'POST',
      url: '/redeem/confirm',
      payload: {
        redemptionId: createBody.redemptionId,
      },
    });

    expect(confirmResponse.statusCode).toBe(200);
    const confirmBody = JSON.parse(confirmResponse.body);
    expect(confirmBody.status).toBe('CONFIRMED');
  });

  it('should be idempotent (double-post does not change balance twice)', async () => {
    // Get initial balance
    const initialBalance = await ledgerService.getBalance({ userId, businessId });

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

    // Verify token
    await fastify.inject({
      method: 'POST',
      url: '/merchant/verify',
      payload: {
        businessId,
        token: createBody.token,
      },
    });

    // First confirm
    await fastify.inject({
      method: 'POST',
      url: '/redeem/confirm',
      payload: {
        redemptionId: createBody.redemptionId,
      },
    });

    const balanceAfterFirst = await ledgerService.getBalance({ userId, businessId });

    // Second confirm (should be idempotent)
    await fastify.inject({
      method: 'POST',
      url: '/redeem/confirm',
      payload: {
        redemptionId: createBody.redemptionId,
      },
    });

    const balanceAfterSecond = await ledgerService.getBalance({ userId, businessId });

    // Balance should only decrease once
    expect(balanceAfterFirst).toBe(initialBalance - 100);
    expect(balanceAfterSecond).toBe(balanceAfterFirst);
  });
});
