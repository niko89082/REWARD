import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { validateEarnParamsJson } from '../validators/rewardProgram.js';
import { validateConfigJson } from '../validators/reward.js';
import { ledgerService } from '../services/ledger.js';

const prisma = new PrismaClient();

async function devRoutes(fastify) {
  fastify.post('/dev/seed', async (request, reply) => {
    // Seed business (idempotent)
    const business = await prisma.business.upsert({
      where: { name: 'Seed Coffee' },
      update: {},
      create: {
        name: 'Seed Coffee',
        latitude: 37.7749,
        longitude: -122.4194,
      },
    });

    // Seed RewardProgram - POINTS_PER_DOLLAR (enabled)
    const pointsPerDollarParams = {
      version: 1,
      pointsPerDollar: 10,
      rounding: 'FLOOR',
      minSubtotalCents: 0,
    };
    validateEarnParamsJson('POINTS_PER_DOLLAR', pointsPerDollarParams);

    // Use upsert for deterministic ID
    const rewardProgram = await prisma.rewardProgram.upsert({
      where: {
        businessId_earnType: {
          businessId: business.id,
          earnType: 'POINTS_PER_DOLLAR',
        },
      },
      update: {
        enabled: true,
        earnParamsJson: pointsPerDollarParams,
      },
      create: {
        businessId: business.id,
        earnType: 'POINTS_PER_DOLLAR',
        earnParamsJson: pointsPerDollarParams,
        enabled: true,
      },
    });

    // Seed RewardProgram - ITEM_POINTS (disabled)
    const itemPointsParams = {
      version: 1,
      items: [
        { squareCatalogObjectId: 'ITEM_SAMPLE_1', points: 50 },
      ],
    };
    validateEarnParamsJson('ITEM_POINTS', itemPointsParams);

    // Use upsert for deterministic ID
    await prisma.rewardProgram.upsert({
      where: {
        businessId_earnType: {
          businessId: business.id,
          earnType: 'ITEM_POINTS',
        },
      },
      update: {
        earnParamsJson: itemPointsParams,
      },
      create: {
        businessId: business.id,
        earnType: 'ITEM_POINTS',
        earnParamsJson: itemPointsParams,
        enabled: false,
      },
    });

    // Seed FREE_ITEM reward
    const freeItemConfig = {
      version: 1,
      displayName: 'Free Coffee',
      squareCatalogObjectId: 'ITEM_FREE_COFFEE',
      squareDiscountName: 'Reward: Free Coffee',
    };
    validateConfigJson('FREE_ITEM', freeItemConfig);

    // Use upsert for deterministic ID
    const freeItemReward = await prisma.reward.upsert({
      where: {
        businessId_type: {
          businessId: business.id,
          type: 'FREE_ITEM',
        },
      },
      update: {
        enabled: true,
        configJson: freeItemConfig,
        costPoints: 100,
      },
      create: {
        businessId: business.id,
        type: 'FREE_ITEM',
        configJson: freeItemConfig,
        costPoints: 100,
        enabled: true,
      },
    });

    // Seed PERCENT_OFF reward
    const percentOffConfig = {
      version: 1,
      displayName: '20% Off',
      percentOff: 20,
      appliesTo: 'ORDER_SUBTOTAL',
      squareDiscountName: 'Reward: 20% Off',
    };
    validateConfigJson('PERCENT_OFF', percentOffConfig);

    // Use upsert for deterministic ID
    const percentOffReward = await prisma.reward.upsert({
      where: {
        businessId_type: {
          businessId: business.id,
          type: 'PERCENT_OFF',
        },
      },
      update: {
        enabled: true,
        configJson: percentOffConfig,
        costPoints: 200,
      },
      create: {
        businessId: business.id,
        type: 'PERCENT_OFF',
        configJson: percentOffConfig,
        costPoints: 200,
        enabled: true,
      },
    });

    // Seed user - use upsert for deterministic ID
    const user = await prisma.user.upsert({
      where: { phoneE164: '+15555550100' },
      update: {},
      create: {
        phoneE164: '+15555550100',
      },
    });

    // Seed LedgerEvent (+500 points) - use fixed externalRef for idempotency
    const seedExternalRef = `seed-${user.id}-${business.id}`;
    const ledgerEvent = await ledgerService.createEarn({
      userId: user.id,
      businessId: business.id,
      points: 500,
      externalRef: seedExternalRef,
      metadata: {
        source: 'seed',
      },
    });

    return {
      businessId: business.id,
      userId: user.id,
      rewardProgramId: rewardProgram.id,
      rewardIds: [freeItemReward.id, percentOffReward.id],
      ledgerEventId: ledgerEvent.id,
      // Include JSON objects for test verification
      rewardProgram: {
        earnParamsJson: pointsPerDollarParams,
      },
      rewards: [
        { configJson: freeItemConfig },
        { configJson: percentOffConfig },
      ],
    };
  });
}

export default devRoutes;
