import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import devRoutes from '../../src/routes/dev.js';

const prisma = new PrismaClient();

describe('Seed endpoint', () => {
  let fastify;

  beforeAll(async () => {
    fastify = Fastify();
    await fastify.register(devRoutes);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    // Cleanup seeded data
    await prisma.ledgerEvent.deleteMany({ where: { metadataJson: { path: ['source'], equals: 'seed' } } });
    await prisma.user.deleteMany({ where: { phoneE164: '+15555550100' } });
    await prisma.reward.deleteMany({ where: { business: { name: 'Seed Coffee' } } });
    await prisma.rewardProgram.deleteMany({ where: { business: { name: 'Seed Coffee' } } });
    await prisma.business.deleteMany({ where: { name: 'Seed Coffee' } });
    await prisma.$disconnect();
  });

  it('should return IDs and JSON with version=1', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/dev/seed',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    
    expect(body.businessId).toBeDefined();
    expect(body.userId).toBeDefined();
    expect(body.rewardProgramId).toBeDefined();
    expect(body.rewardIds).toHaveLength(2);
    expect(body.ledgerEventId).toBeDefined();

    // Verify JSON structures have version=1
    expect(body.rewardProgram.earnParamsJson.version).toBe(1);
    expect(body.rewardProgram.earnParamsJson.pointsPerDollar).toBeDefined();
    
    expect(body.rewards[0].configJson.version).toBe(1);
    expect(body.rewards[0].configJson.displayName).toBeDefined();
    expect(body.rewards[0].configJson.squareDiscountName).toBeDefined();
    
    expect(body.rewards[1].configJson.version).toBe(1);
    expect(body.rewards[1].configJson.percentOff).toBe(20);
  });

  it('should be idempotent (no duplicates on second call)', async () => {
    // First call
    const first = await fastify.inject({
      method: 'POST',
      url: '/dev/seed',
    });
    const firstBody = JSON.parse(first.body);

    // Second call
    const second = await fastify.inject({
      method: 'POST',
      url: '/dev/seed',
    });
    const secondBody = JSON.parse(second.body);

    // IDs should be the same
    expect(firstBody.businessId).toBe(secondBody.businessId);
    expect(firstBody.userId).toBe(secondBody.userId);
    expect(firstBody.rewardProgramId).toBe(secondBody.rewardProgramId);
    expect(firstBody.rewardIds).toEqual(secondBody.rewardIds);

    // Verify only one enabled RewardProgram
    const enabledPrograms = await prisma.rewardProgram.findMany({
      where: {
        business: { name: 'Seed Coffee' },
        enabled: true,
      },
    });
    expect(enabledPrograms).toHaveLength(1);
    expect(enabledPrograms[0].earnType).toBe('POINTS_PER_DOLLAR');
  });
});
