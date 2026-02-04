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

    let rewardProgram = await prisma.rewardProgram.findFirst({
      where: {
        businessId: business.id,
        earnType: 'POINTS_PER_DOLLAR',
      },
    });

    if (!rewardProgram) {
      rewardProgram = await prisma.rewardProgram.create({
        data: {
          businessId: business.id,
          earnType: 'POINTS_PER_DOLLAR',
          earnParamsJson: pointsPerDollarParams,
          enabled: true,
        },
      });
    } else {
      rewardProgram = await prisma.rewardProgram.update({
        where: { id: rewardProgram.id },
        data: { enabled: true },
      });
    }

    // Seed RewardProgram - ITEM_POINTS (disabled)
    const itemPointsParams = {
      version: 1,
      items: [
        { squareCatalogObjectId: 'ITEM_SAMPLE_1', points: 50 },
      ],
    };
    validateEarnParamsJson('ITEM_POINTS', itemPointsParams);

    let itemPointsProgram = await prisma.rewardProgram.findFirst({
      where: {
        businessId: business.id,
        earnType: 'ITEM_POINTS',
      },
    });

    if (!itemPointsProgram) {
      await prisma.rewardProgram.create({
        data: {
          businessId: business.id,
          earnType: 'ITEM_POINTS',
          earnParamsJson: itemPointsParams,
          enabled: false,
        },
      });
    }

    // Seed FREE_ITEM reward
    const freeItemConfig = {
      version: 1,
      displayName: 'Free Coffee',
      squareCatalogObjectId: 'ITEM_FREE_COFFEE',
      squareDiscountName: 'Reward: Free Coffee',
    };
    validateConfigJson('FREE_ITEM', freeItemConfig);

    let freeItemReward = await prisma.reward.findFirst({
      where: {
        businessId: business.id,
        type: 'FREE_ITEM',
      },
    });

    if (!freeItemReward) {
      freeItemReward = await prisma.reward.create({
        data: {
          businessId: business.id,
          type: 'FREE_ITEM',
          configJson: freeItemConfig,
          costPoints: 100,
          enabled: true,
        },
      });
    } else {
      freeItemReward = await prisma.reward.update({
        where: { id: freeItemReward.id },
        data: { enabled: true },
      });
    }

    // Seed PERCENT_OFF reward
    const percentOffConfig = {
      version: 1,
      displayName: '20% Off',
      percentOff: 20,
      appliesTo: 'ORDER_SUBTOTAL',
      squareDiscountName: 'Reward: 20% Off',
    };
    validateConfigJson('PERCENT_OFF', percentOffConfig);

    let percentOffReward = await prisma.reward.findFirst({
      where: {
        businessId: business.id,
        type: 'PERCENT_OFF',
      },
    });

    if (!percentOffReward) {
      percentOffReward = await prisma.reward.create({
        data: {
          businessId: business.id,
          type: 'PERCENT_OFF',
          configJson: percentOffConfig,
          costPoints: 200,
          enabled: true,
        },
      });
    } else {
      percentOffReward = await prisma.reward.update({
        where: { id: percentOffReward.id },
        data: { enabled: true },
      });
    }

    // Seed user
    let user = await prisma.user.findUnique({
      where: { phoneE164: '+15555550100' },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phoneE164: '+15555550100',
        },
      });
    }

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
