/**
 * Build and configure Fastify server
 */
declare function buildServer(): Promise<import("fastify").FastifyInstance<import("node:http").Server<typeof import("node:http").IncomingMessage, typeof import("node:http").ServerResponse>, import("node:http").IncomingMessage, import("node:http").ServerResponse<import("node:http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>>;
export { buildServer };
//# sourceMappingURL=index.d.ts.map