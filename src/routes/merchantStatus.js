import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function merchantStatusRoutes(fastify) {
  /**
   * GET /merchant/status?businessId=...
   * Returns the Square connection status for a business.
   */
  fastify.get('/merchant/status', async (request, reply) => {
    const { businessId } = request.query;

    if (!businessId) {
      return reply.code(400).send({ error: 'businessId is required' });
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        squareEnvironment: true,
        squareMerchantId: true,
        squareLocationId: true,
        squareAccessToken: true,
      },
    });

    if (!business) {
      return reply.code(404).send({ error: 'business_not_found' });
    }

    // Check if connected: must have both squareMerchantId and squareAccessToken
    const isConnected = !!(business.squareMerchantId && business.squareAccessToken);

    if (!isConnected) {
      return {
        connected: false,
      };
    }

    return {
      connected: true,
      squareEnvironment: business.squareEnvironment,
      squareMerchantId: business.squareMerchantId,
      squareLocationId: business.squareLocationId,
    };
  });
}

export default merchantStatusRoutes;
