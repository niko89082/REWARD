import { z } from 'zod';
import { redemptionService } from '../services/redemption.js';

const verifySchema = z.object({
  businessId: z.string().min(1),
  token: z.string().min(1),
});

async function merchantRoutes(fastify) {
  fastify.post('/merchant/verify', async (request, reply) => {
    const { businessId, token } = verifySchema.parse(request.body);

    try {
      const redemption = await redemptionService.verifyAndLockToken({ businessId, token });
      const rewardConfig = redemption.reward.configJson;

      return {
        valid: true,
        redemptionId: redemption.id,
        rewardId: redemption.rewardId,
        rewardDisplayName: rewardConfig.displayName,
        instructionText: `Apply discount tile: '${rewardConfig.squareDiscountName}' now.`,
        expiresAt: redemption.expiresAt,
      };
    } catch (error) {
      return {
        valid: false,
        reason: error.message,
      };
    }
  });
}

export default merchantRoutes;
