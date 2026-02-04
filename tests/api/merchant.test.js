import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import devRoutes from '../../src/routes/dev.js';
import redeemRoutes from '../../src/routes/redeem.js';
import merchantRoutes from '../../src/routes/merchant.js';

const prisma = new PrismaClient();

describe('Merchant verify endpoint', () => {
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

  it('should return valid with rewardDisplayName and instructionText containing squareDiscountName', async () => {
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
    const verifyResponse = await fastify.inject({
      method: 'POST',
      url: '/merchant/verify',
      payload: {
        businessId,
        token: createBody.token,
      },
    });

    expect(verifyResponse.statusCode).toBe(200);
    const verifyBody = JSON.parse(verifyResponse.body);
    
    expect(verifyBody.valid).toBe(true);
    expect(verifyBody.redemptionId).toBeDefined();
    expect(verifyBody.rewardId).toBeDefined();
    expect(verifyBody.rewardDisplayName).toBe('Free Coffee');
    expect(verifyBody.instructionText).toContain('Reward: Free Coffee');
    expect(verifyBody.instructionText).toBe("Apply discount tile: 'Reward: Free Coffee' now.");
    expect(verifyBody.expiresAt).toBeDefined();
  });

  it('should return invalid for expired token', async () => {
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

    // Expire it
    await prisma.redemption.update({
      where: { id: createBody.redemptionId },
      data: {
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    // Verify token
    const verifyResponse = await fastify.inject({
      method: 'POST',
      url: '/merchant/verify',
      payload: {
        businessId,
        token: createBody.token,
      },
    });

    expect(verifyResponse.statusCode).toBe(200);
    const verifyBody = JSON.parse(verifyResponse.body);
    expect(verifyBody.valid).toBe(false);
    expect(verifyBody.reason).toBeDefined();
  });
});
