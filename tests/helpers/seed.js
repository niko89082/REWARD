/**
 * Helper function to call POST /dev/seed with proper worker isolation headers
 * @param {Object} fastify - Fastify instance
 * @returns {Promise<Object>} Parsed response body
 */
export async function seedDevData(fastify) {
  const response = await fastify.inject({
    method: 'POST',
    url: '/dev/seed',
    headers: {
      'x-jest-worker-id': process.env.JEST_WORKER_ID || '0',
    },
  });
  
  if (response.statusCode !== 200) {
    throw new Error(`Seed failed: ${response.statusCode} - ${response.body}`);
  }
  
  return JSON.parse(response.body);
}
