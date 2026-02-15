import type { FastifyRequest, FastifyReply } from 'fastify';
/**
 * Global error handler
 */
export declare function errorHandler(error: Error & {
    statusCode?: number;
    code?: string;
}, request: FastifyRequest, reply: FastifyReply): Promise<void>;
//# sourceMappingURL=error.d.ts.map