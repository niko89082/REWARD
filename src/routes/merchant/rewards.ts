import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { RewardType } from '@prisma/client';
import {
  createReward,
  getMerchantRewards,
  updateReward,
  syncRewardToPOS,
} from '../../services/merchant.service';
import { logger } from '../../lib/logger';

const createRewardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.nativeEnum(RewardType),
  pointsCost: z.number().int().positive().optional(),
  itemName: z.string().optional(),
  itemCount: z.number().int().positive().optional(),
});

const updateRewardSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  pointsCost: z.number().int().positive().optional(),
  itemName: z.string().optional(),
  itemCount: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Merchant rewards routes
 */
export default async function merchantRewardsRoutes(fastify: FastifyInstance) {
  // Create reward
  fastify.post(
    '/api/merchant/rewards',
    { preHandler: [fastify.authenticateMerchant] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const merchantId = (request as any).merchantId;
        const data = createRewardSchema.parse(request.body);

        const reward = await createReward(merchantId, {
          name: data.name,
          type: data.type,
          ...(data.description !== undefined && { description: data.description }),
          ...(data.pointsCost !== undefined && { pointsCost: data.pointsCost }),
          ...(data.itemName !== undefined && { itemName: data.itemName }),
          ...(data.itemCount !== undefined && { itemCount: data.itemCount }),
        });

        reply.code(201).send({ reward });
      } catch (error) {
        logger.error({ error }, 'Create reward error');
        throw error;
      }
    }
  );

  // List rewards
  fastify.get(
    '/api/merchant/rewards',
    { preHandler: [fastify.authenticateMerchant] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const merchantId = (request as any).merchantId;
        const includeInactive = (request.query as any).includeInactive === 'true';

        const rewards = await getMerchantRewards(merchantId, includeInactive);

        reply.send({ rewards });
      } catch (error) {
        logger.error({ error }, 'List rewards error');
        throw error;
      }
    }
  );

  // Update reward
  fastify.put(
    '/api/merchant/rewards/:id',
    { preHandler: [fastify.authenticateMerchant] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const merchantId = (request as any).merchantId;
        const { id } = request.params as { id: string };
        const data = updateRewardSchema.parse(request.body);

        const reward = await updateReward(id, merchantId, {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.pointsCost !== undefined && { pointsCost: data.pointsCost }),
          ...(data.itemName !== undefined && { itemName: data.itemName }),
          ...(data.itemCount !== undefined && { itemCount: data.itemCount }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        });

        reply.send({ reward });
      } catch (error) {
        logger.error({ error }, 'Update reward error');
        throw error;
      }
    }
  );

  // Sync reward to POS
  fastify.post(
    '/api/merchant/rewards/:id/sync',
    { preHandler: [fastify.authenticateMerchant] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const merchantId = (request as any).merchantId;
        const { id } = request.params as { id: string };

        await syncRewardToPOS(id, merchantId);

        reply.send({ success: true });
      } catch (error) {
        logger.error({ error }, 'Sync reward error');
        throw error;
      }
    }
  );
}
