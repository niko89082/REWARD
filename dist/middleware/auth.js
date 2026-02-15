import { logger } from '../lib/logger';
/**
 * Authenticate merchant from JWT token
 */
export async function authenticateMerchant(request, reply) {
    try {
        await request.jwtVerify();
        const merchantId = request.user.merchantId;
        if (!merchantId) {
            reply.code(401).send({ error: 'Invalid token: missing merchantId' });
            return;
        }
        // Attach merchant to request
        request.merchantId = merchantId;
    }
    catch (error) {
        logger.error({ error }, 'Merchant authentication failed');
        reply.code(401).send({ error: 'Unauthorized' });
    }
}
/**
 * Authenticate customer from JWT token
 */
export async function authenticateCustomer(request, reply) {
    try {
        await request.jwtVerify();
        const customerId = request.user.customerId;
        if (!customerId) {
            reply.code(401).send({ error: 'Invalid token: missing customerId' });
            return;
        }
        // Attach customer to request
        request.customerId = customerId;
    }
    catch (error) {
        logger.error({ error }, 'Customer authentication failed');
        reply.code(401).send({ error: 'Unauthorized' });
    }
}
//# sourceMappingURL=auth.js.map