import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/error';
import { authenticateMerchant, authenticateCustomer } from './middleware/auth';
import { startWebhookWorker } from './jobs/processWebhook.job';
import { startReconciliationWorker } from './jobs/reconciliation.job';

// Import routes
import squareWebhookRoutes from './routes/webhooks/square';
import merchantAuthRoutes from './routes/merchant/auth';
import merchantOAuthRoutes from './routes/merchant/oauth';
import merchantRewardsRoutes from './routes/merchant/rewards';
import merchantRedemptionsRoutes from './routes/merchant/redemptions';
import customerAuthRoutes from './routes/customer/auth';
import customerCardsRoutes from './routes/customer/cards';
import customerRedemptionsRoutes from './routes/customer/redemptions';

/**
 * Build and configure Fastify server
 */
async function buildServer() {
  const fastify = Fastify({
    logger: true,
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Adjust for your needs
  });

  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
  });

  // Register authentication decorators
  fastify.decorate('authenticateMerchant', authenticateMerchant);
  fastify.decorate('authenticateCustomer', authenticateCustomer);

  // Register error handler
  fastify.setErrorHandler(errorHandler);

  // Health check endpoint
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register routes
  await fastify.register(squareWebhookRoutes);
  await fastify.register(merchantAuthRoutes);
  await fastify.register(merchantOAuthRoutes);
  await fastify.register(merchantRewardsRoutes);
  await fastify.register(merchantRedemptionsRoutes);
  await fastify.register(customerAuthRoutes);
  await fastify.register(customerCardsRoutes);
  await fastify.register(customerRedemptionsRoutes);

  return fastify;
}

/**
 * Start server
 */
async function start() {
  try {
    const server = await buildServer();

    // Start BullMQ workers
    const webhookWorker = startWebhookWorker();
    const reconciliationWorker = startReconciliationWorker();

    // Start server
    await server.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    logger.info(`Server listening on port ${env.PORT}`);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, closing server...`);
      
      try {
        // Close workers
        await webhookWorker.close();
        await reconciliationWorker.close();
        
        // Close server
        await server.close();
        
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

// Start server only when run directly (not when imported for tests)
if (!process.env.VITEST) {
  start();
}

export { buildServer };
