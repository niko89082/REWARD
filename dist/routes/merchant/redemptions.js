import { z } from 'zod';
import { verifyRedemption, completeRedemption } from '../../services/redemption.service';
import { logger } from '../../lib/logger';
const verifyRedemptionSchema = z.object({
    code: z.string().min(1),
});
const completeRedemptionSchema = z.object({
    redemptionId: z.string().uuid(),
});
/**
 * Merchant redemption routes
 */
export default async function merchantRedemptionsRoutes(fastify) {
    // Verify redemption code
    fastify.post('/api/merchant/redemptions/verify', { preHandler: [fastify.authenticateMerchant] }, async (request, reply) => {
        try {
            const merchantId = request.merchantId;
            const { code } = verifyRedemptionSchema.parse(request.body);
            const result = await verifyRedemption(code, merchantId);
            if (!result.valid) {
                reply.code(400).send({ error: result.error });
                return;
            }
            reply.send(result);
        }
        catch (error) {
            logger.error({ error }, 'Verify redemption error');
            throw error;
        }
    });
    // Complete redemption
    fastify.post('/api/merchant/redemptions/complete', { preHandler: [fastify.authenticateMerchant] }, async (request, reply) => {
        try {
            const merchantId = request.merchantId;
            const { redemptionId } = completeRedemptionSchema.parse(request.body);
            await completeRedemption(redemptionId, merchantId);
            reply.send({ success: true });
        }
        catch (error) {
            logger.error({ error }, 'Complete redemption error');
            throw error;
        }
    });
}
//# sourceMappingURL=redemptions.js.map