import { redemptionService } from '../services/redemption.js';

async function adminRoutes(fastify) {
  fastify.post('/admin/cancel-expired', async (request, reply) => {
    const canceledCount = await redemptionService.cancelExpiredRedemptions();
    return { canceledCount };
  });
}

export default adminRoutes;
