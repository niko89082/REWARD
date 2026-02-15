import { z } from 'zod';
import { createMerchant, verifyMerchantPassword } from '../../services/merchant.service';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
});
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});
/**
 * Merchant authentication routes
 */
export default async function merchantAuthRoutes(fastify) {
    // Signup
    fastify.post('/api/merchant/auth/signup', async (request, reply) => {
        try {
            const data = signupSchema.parse(request.body);
            const merchant = await createMerchant(data);
            // Generate JWT
            const token = fastify.jwt.sign({
                merchantId: merchant.id,
                type: 'merchant',
            });
            reply.code(201).send({
                merchant: {
                    id: merchant.id,
                    email: merchant.email,
                    name: merchant.name,
                },
                token,
            });
        }
        catch (error) {
            logger.error({ error }, 'Merchant signup error');
            throw error;
        }
    });
    // Login
    fastify.post('/api/merchant/auth/login', async (request, reply) => {
        try {
            const data = loginSchema.parse(request.body);
            const merchant = await verifyMerchantPassword(data.email, data.password);
            if (!merchant) {
                reply.code(401).send({ error: 'Invalid email or password' });
                return;
            }
            // Generate JWT
            const token = fastify.jwt.sign({
                merchantId: merchant.id,
                type: 'merchant',
            });
            reply.send({
                merchant: {
                    id: merchant.id,
                    email: merchant.email,
                    name: merchant.name,
                },
                token,
            });
        }
        catch (error) {
            logger.error({ error }, 'Merchant login error');
            throw error;
        }
    });
    // Get current merchant (protected)
    fastify.get('/api/merchant/auth/me', { preHandler: [fastify.authenticateMerchant] }, async (request, reply) => {
        try {
            const merchantId = request.merchantId;
            const { getMerchantById } = await import('../../services/merchant.service.js');
            const merchant = await getMerchantById(merchantId);
            if (!merchant) {
                reply.code(404).send({ error: 'Merchant not found' });
                return;
            }
            reply.send({ merchant });
        }
        catch (error) {
            logger.error({ error }, 'Get merchant error');
            throw error;
        }
    });
}
//# sourceMappingURL=auth.js.map