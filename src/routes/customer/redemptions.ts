import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  initiateRedemption,
  cancelRedemption,
} from '../../services/redemption.service';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

const createRedemptionSchema = z.object({
  merchantId: z.string().uuid(),
  rewardId: z.string().uuid(),
});

/**
 * Customer redemption routes
 */
export default async function customerRedemptionsRoutes(fastify: FastifyInstance) {
  // Generate redemption (QR + PIN)
  fastify.post(
    '/api/customer/redemptions',
    { preHandler: [fastify.authenticateCustomer] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const customerId = (request as any).customerId;
        const { merchantId, rewardId } = createRedemptionSchema.parse(request.body);

        const redemption = await initiateRedemption(customerId, merchantId, rewardId);

        reply.code(201).send({ redemption });
      } catch (error) {
        logger.error({ error }, 'Create redemption error');
        throw error;
      }
    }
  );

  // List redemptions
  fastify.get(
    '/api/customer/redemptions',
    { preHandler: [fastify.authenticateCustomer] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const customerId = (request as any).customerId;
        const merchantId = (request.query as any).merchantId;

        const redemptions = await prisma.redemption.findMany({
          where: {
            customerId,
            ...(merchantId ? { merchantId } : {}),
          },
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            reward: {
              select: {
                id: true,
                name: true,
                description: true,
                type: true,
                pointsCost: true,
              },
            },
            merchant: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        reply.send({ redemptions });
      } catch (error) {
        logger.error({ error }, 'List redemptions error');
        throw error;
      }
    }
  );

  // Cancel redemption
  fastify.delete(
    '/api/customer/redemptions/:id',
    { preHandler: [fastify.authenticateCustomer] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const customerId = (request as any).customerId;
        const { id } = request.params as { id: string };

        await cancelRedemption(id, customerId);

        reply.send({ success: true });
      } catch (error) {
        logger.error({ error }, 'Cancel redemption error');
        throw error;
      }
    }
  );
}
