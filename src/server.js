import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { makeSquareClient } from './integrations/squareClient.js';
import healthRoutes from './routes/health.js';
import devRoutes from './routes/dev.js';
import balanceRoutes from './routes/balance.js';
import redeemRoutes from './routes/redeem.js';
import merchantRoutes from './routes/merchant.js';
import adminRoutes from './routes/admin.js';
import squareRoutes from './routes/square.js';
import squareWebhookRoutes from './routes/squareWebhooks.js';
import merchantStatusRoutes from './routes/merchantStatus.js';

/**
 * Build and configure the Fastify server instance.
 * Supports dependency injection for testing (e.g., mock Square client).
 * 
 * @param {Object} options - Optional dependency injection
 * @param {Object} options.squareClient - Square client instance (if not provided, creates default)
 * @returns {Promise<FastifyInstance>} Configured Fastify server
 */
export async function buildServer({ squareClient } = {}) {
  const config = loadConfig();

  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // Inject squareClient via Fastify decorate (for dependency injection in tests)
  if (squareClient) {
    fastify.decorate('squareClient', squareClient);
  } else {
    const defaultSquareClient = makeSquareClient({ config });
    fastify.decorate('squareClient', defaultSquareClient);
  }

  // Register routes (synchronously, no await)
  fastify.register(healthRoutes);
  fastify.register(devRoutes);
  fastify.register(balanceRoutes);
  fastify.register(redeemRoutes);
  fastify.register(merchantRoutes);
  fastify.register(adminRoutes);
  fastify.register(squareRoutes);
  fastify.register(squareWebhookRoutes);
  fastify.register(merchantStatusRoutes);

  return fastify;
}

// Only start server if this file is executed directly (not imported)
// In ESM, we check if import.meta.url matches the main module
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const entry = process.argv[1] ? resolve(process.argv[1]) : null;
const isMainModule = entry && entry === resolve(__filename);

if (isMainModule) {
  const start = async () => {
    try {
      const fastify = await buildServer();
      await fastify.ready();

      const config = loadConfig();
      await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
      fastify.log.info(`Server listening on port ${config.PORT}`);

      // Graceful shutdown
      const shutdown = async (signal) => {
        fastify.log.info(`Received ${signal}, closing server...`);
        try {
          await fastify.close();
          process.exit(0);
        } catch (err) {
          fastify.log.error(err);
          process.exit(1);
        }
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  };

  start();
}
