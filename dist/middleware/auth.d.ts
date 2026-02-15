import type { FastifyRequest, FastifyReply } from 'fastify';
/**
 * Authenticate merchant from JWT token
 */
export declare function authenticateMerchant(request: FastifyRequest, reply: FastifyReply): Promise<void>;
/**
 * Authenticate customer from JWT token
 */
export declare function authenticateCustomer(request: FastifyRequest, reply: FastifyReply): Promise<void>;
//# sourceMappingURL=auth.d.ts.map