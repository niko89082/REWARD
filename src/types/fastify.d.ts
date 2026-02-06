import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticateMerchant: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    authenticateCustomer: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}
