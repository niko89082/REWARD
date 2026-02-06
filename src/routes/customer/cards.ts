import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { linkCardToCustomer, getBalance } from '../../services/customer.service';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

const linkCardSchema = z.object({
  last4: z.string().length(4),
  zipCode: z.string().min(5).max(10),
});

/**
 * Customer card routes
 */
export default async function customerCardsRoutes(fastify: FastifyInstance) {
  // Link card
  fastify.post(
    '/api/customer/cards/link',
    { preHandler: [fastify.authenticateCustomer] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const customerId = (request as any).customerId;
        const { last4, zipCode } = linkCardSchema.parse(request.body);

        const linkedCardId = await linkCardToCustomer(customerId, last4, zipCode);

        reply.send({ success: true, linkedCardId });
      } catch (error) {
        logger.error({ error }, 'Link card error');
        throw error;
      }
    }
  );

  // List linked cards
  fastify.get(
    '/api/customer/cards',
    { preHandler: [fastify.authenticateCustomer] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const customerId = (request as any).customerId;

        const cards = await prisma.linkedCard.findMany({
          where: { customerId },
          select: {
            id: true,
            last4: true,
            brand: true,
            posProvider: true,
            createdAt: true,
          },
        });

        reply.send({ cards });
      } catch (error) {
        logger.error({ error }, 'List cards error');
        throw error;
      }
    }
  );

  // Get balance at merchant
  fastify.get(
    '/api/customer/balance/:merchantId',
    { preHandler: [fastify.authenticateCustomer] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const customerId = (request as any).customerId;
        const { merchantId } = request.params as { merchantId: string };

        const balance = await getBalance(customerId, merchantId);

        reply.send({ balance });
      } catch (error) {
        logger.error({ error }, 'Get balance error');
        throw error;
      }
    }
  );
}
