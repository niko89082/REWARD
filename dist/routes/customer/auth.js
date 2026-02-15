import { z } from 'zod';
import { sendVerificationCode, verifyCode } from '../../services/sms.service';
import { getCustomerByPhone, createCustomerWithPhone, } from '../../services/customer.service';
import { validatePhoneNumber } from '../../config/env';
import { logger } from '../../lib/logger';
const signupSchema = z.object({
    phoneNumber: z.string().refine((phone) => validatePhoneNumber(phone), { message: 'Phone number must be in E.164 format (+1234567890)' }),
});
const verifySchema = z.object({
    phoneNumber: z.string().refine((phone) => validatePhoneNumber(phone), { message: 'Phone number must be in E.164 format (+1234567890)' }),
    code: z.string().length(6),
});
/**
 * Customer authentication routes
 */
export default async function customerAuthRoutes(fastify) {
    // Signup (send SMS code)
    fastify.post('/api/customer/auth/signup', async (request, reply) => {
        try {
            const { phoneNumber } = signupSchema.parse(request.body);
            // Check if customer already exists
            let customer = await getCustomerByPhone(phoneNumber);
            if (!customer) {
                // Create customer
                const customerId = await createCustomerWithPhone(phoneNumber);
                customer = { id: customerId, phoneNumber, createdAt: new Date(), updatedAt: new Date() };
            }
            // Send verification code
            await sendVerificationCode(phoneNumber);
            reply.send({
                message: 'Verification code sent',
                customerId: customer.id,
            });
        }
        catch (error) {
            logger.error({ error }, 'Customer signup error');
            throw error;
        }
    });
    // Verify SMS code and return JWT
    fastify.post('/api/customer/auth/verify', async (request, reply) => {
        try {
            const { phoneNumber, code } = verifySchema.parse(request.body);
            // Verify code
            const isValid = await verifyCode(phoneNumber, code);
            if (!isValid) {
                reply.code(401).send({ error: 'Invalid verification code' });
                return;
            }
            // Get or create customer
            let customer = await getCustomerByPhone(phoneNumber);
            if (!customer) {
                const customerId = await createCustomerWithPhone(phoneNumber);
                customer = { id: customerId, phoneNumber, createdAt: new Date(), updatedAt: new Date() };
            }
            // Generate JWT
            const token = fastify.jwt.sign({
                customerId: customer.id,
                type: 'customer',
            });
            reply.send({
                customer: {
                    id: customer.id,
                    phoneNumber: customer.phoneNumber,
                },
                token,
            });
        }
        catch (error) {
            logger.error({ error }, 'Customer verify error');
            throw error;
        }
    });
    // Get current customer (protected)
    fastify.get('/api/customer/auth/me', { preHandler: [fastify.authenticateCustomer] }, async (request, reply) => {
        try {
            const customerId = request.customerId;
            const { prisma } = await import('../../lib/prisma.js');
            const customer = await prisma.customer.findUnique({
                where: { id: customerId },
                select: {
                    id: true,
                    phoneNumber: true,
                    createdAt: true,
                },
            });
            if (!customer) {
                reply.code(404).send({ error: 'Customer not found' });
                return;
            }
            reply.send({ customer });
        }
        catch (error) {
            logger.error({ error }, 'Get customer error');
            throw error;
        }
    });
}
//# sourceMappingURL=auth.js.map