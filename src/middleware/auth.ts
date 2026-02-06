import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../lib/logger';

/**
 * Authenticate merchant from JWT token
 */
export async function authenticateMerchant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    const merchantId = (request.user as any).merchantId;
    
    if (!merchantId) {
      reply.code(401).send({ error: 'Invalid token: missing merchantId' });
      return;
    }

    // Attach merchant to request
    (request as any).merchantId = merchantId;
  } catch (error) {
    logger.error({ error }, 'Merchant authentication failed');
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

/**
 * Authenticate customer from JWT token
 */
export async function authenticateCustomer(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    const customerId = (request.user as any).customerId;
    
    if (!customerId) {
      reply.code(401).send({ error: 'Invalid token: missing customerId' });
      return;
    }

    // Attach customer to request
    (request as any).customerId = customerId;
  } catch (error) {
    logger.error({ error }, 'Customer authentication failed');
    reply.code(401).send({ error: 'Unauthorized' });
  }
}
