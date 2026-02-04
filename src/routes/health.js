async function healthRoutes(fastify) {
  fastify.get('/health', async (request, reply) => {
    return { ok: true };
  });
}

export default healthRoutes;
