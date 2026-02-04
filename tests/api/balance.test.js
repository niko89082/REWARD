import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import devRoutes from '../../src/routes/dev.js';
import balanceRoutes from '../../src/routes/balance.js';
import redeemRoutes from '../../src/routes/redeem.js';
import merchantRoutes from '../../src/routes/merchant.js';
import { ledgerService } from '../../src/services/ledger.js';
import { redemptionService } from '../../src/services/redemption.js';

const prisma = new PrismaClient();

describe('Balance endpoint', () => {
  let fastify;
  let businessId;
  let userId;
  let rewardId;

  beforeAll(async () => {
    fastify = Fastify();
    await fastify.register(devRoutes);
    await fastify.register(balanceRoutes);
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
    await prisma.ledgerEvent.deleteMany({ where: { userId, businessId } });
    await prisma.redemption.deleteMany({ where: { userId, businessId } });
    await prisma.reward.deleteMany({ where: { businessId } });
    await prisma.rewardProgram.deleteMany({ where: { businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('should return 500 after seed', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: `/balance?userId=${userId}&businessId=${businessId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.balance).toBe(500);
  });

  it('should show deduction after confirm', async () => {
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

    // Confirm redemption
    await fastify.inject({
      method: 'POST',
      url: '/redeem/confirm',
      payload: {
        redemptionId: createBody.redemptionId,
      },
    });

    // Check balance
    const balanceResponse = await fastify.inject({
      method: 'GET',
      url: `/balance?userId=${userId}&businessId=${businessId}`,
    });

    const balanceBody = JSON.parse(balanceResponse.body);
    // Should be 500 - 100 (costPoints) = 400
    expect(balanceBody.balance).toBe(400);
  });
});
