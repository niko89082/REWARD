import { z } from 'zod';
import { redemptionService } from '../services/redemption.js';

const createRedemptionSchema = z.object({
  userId: z.string().min(1),
  businessId: z.string().min(1),
  rewardId: z.string().min(1),
});

const confirmRedemptionSchema = z.object({
  redemptionId: z.string().min(1),
  providerPaymentId: z.string().optional(),
  providerOrderId: z.string().optional(),
});

async function redeemRoutes(fastify) {
  fastify.post('/redeem/create', async (request, reply) => {
    const { userId, businessId, rewardId } = createRedemptionSchema.parse(request.body);
    const redemption = await redemptionService.createRedemption({
      userId,
      businessId,
      rewardId,
    });
    return {
      redemptionId: redemption.id,
      token: redemption.token,
      expiresAt: redemption.expiresAt,
    };
  });

  fastify.post('/redeem/confirm', async (request, reply) => {
    const { redemptionId, providerPaymentId, providerOrderId } = confirmRedemptionSchema.parse(request.body);
    await redemptionService.confirmRedemption({
      redemptionId,
      providerPaymentId,
      providerOrderId,
    });
    return { status: 'CONFIRMED' };
  });
}

export default redeemRoutes;
