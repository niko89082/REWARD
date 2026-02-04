import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../config.js';
import { getRedis } from '../services/redis.js';
import { makeSquareClient } from '../integrations/squareClient.js';

const prisma = new PrismaClient();
const config = loadConfig();

async function squareRoutes(fastify) {
  // Get squareClient from fastify instance (injected via decorate in buildServer)
  // If not decorated, create default client
  const getSquareClient = () => {
    if (fastify.squareClient) {
      return fastify.squareClient;
    }
    // Fallback to default client if not injected
    return makeSquareClient({ config });
  };
  /**
   * GET /square/oauth/start?businessId=...
   * Initiates Square OAuth flow by redirecting to Square authorization page.
   */
  fastify.get('/square/oauth/start', async (request, reply) => {
    const { businessId } = request.query;

    if (!businessId) {
      return reply.code(400).send({ error: 'businessId is required' });
    }

    // Validate business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      return reply.code(404).send({ error: 'business_not_found' });
    }

    // Generate cryptographically strong state
    const state = randomBytes(16).toString('hex');

    // Store state in Redis with 10 minute TTL
    const redis = getRedis();
    const stateKey = `square_oauth_state:${state}`;
    const stateValue = JSON.stringify({ businessId });
    
    try {
      await redis.setex(stateKey, 600, stateValue);
    } catch (err) {
      fastify.log.error('Failed to store OAuth state in Redis:', err);
      return reply.code(500).send({ error: 'failed_to_store_state' });
    }

    // Build Square authorization URL
    const authUrl = new URL('https://connect.squareupsandbox.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', config.SQUARE_APP_ID);
    authUrl.searchParams.set('scope', config.SQUARE_OAUTH_SCOPES);
    authUrl.searchParams.set('session', 'false');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('redirect_uri', config.SQUARE_OAUTH_REDIRECT_URL);

    // Redirect to Square
    return reply.code(302).redirect(authUrl.toString());
  });

  /**
   * GET /square/oauth/callback?code=...&state=...
   * Handles Square OAuth callback and stores merchant/location data.
   */
  fastify.get('/square/oauth/callback', async (request, reply) => {
    const { code, state, error } = request.query;

    // Handle OAuth errors from Square
    if (error) {
      return reply.code(400).send({
        error: 'square_oauth_error',
        detail: error,
      });
    }

    if (!code || !state) {
      return reply.code(400).send({ error: 'code and state are required' });
    }

    // Load state from Redis
    const redis = getRedis();
    const stateKey = `square_oauth_state:${state}`;
    
    let stateData;
    try {
      const stateValue = await redis.get(stateKey);
      if (!stateValue) {
        return reply.code(400).send({ error: 'invalid_state' });
      }
      stateData = JSON.parse(stateValue);
    } catch (err) {
      fastify.log.error('Failed to load OAuth state from Redis:', err);
      return reply.code(400).send({ error: 'invalid_state' });
    }

    const { businessId } = stateData;

    // Exchange code for tokens
    const squareClient = getSquareClient();
    let tokenResponse;
    try {
      tokenResponse = await squareClient.exchangeCodeForToken({ code });
    } catch (err) {
      fastify.log.error('Square token exchange failed:', err);
      return reply.code(500).send({ error: 'token_exchange_failed', detail: err.message });
    }

    const {
      access_token: accessToken,
      refresh_token: refreshToken,
      merchant_id: merchantId,
      expires_at: expiresAt,
    } = tokenResponse;

    // Fetch merchant and locations
    let merchantData;
    try {
      merchantData = await squareClient.getMerchantAndLocations({ accessToken });
    } catch (err) {
      fastify.log.error('Square merchant/locations fetch failed:', err);
      return reply.code(500).send({ error: 'merchant_fetch_failed', detail: err.message });
    }

    const { merchant, locations } = merchantData;

    // Choose location: first ACTIVE, else first location, else null
    let locationId = null;
    if (locations && locations.length > 0) {
      const activeLocation = locations.find(loc => loc.status === 'ACTIVE');
      locationId = activeLocation ? activeLocation.id : locations[0].id;
    }

    // Update Business record
    const updateData = {
      squareEnvironment: 'sandbox',
      squareMerchantId: merchantId,
      squareLocationId: locationId,
      squareAccessToken: accessToken,
      squareRefreshToken: refreshToken,
      squareConnectedAt: new Date(),
    };

    if (expiresAt) {
      updateData.squareTokenExpiresAt = new Date(expiresAt);
    }

    try {
      await prisma.business.update({
        where: { id: businessId },
        data: updateData,
      });
    } catch (err) {
      fastify.log.error('Failed to update business with Square data:', err);
      return reply.code(500).send({ error: 'database_update_failed' });
    }

    // Delete state key from Redis
    try {
      await redis.del(stateKey);
    } catch (err) {
      fastify.log.warn('Failed to delete OAuth state from Redis:', err);
      // Don't fail the request if state cleanup fails
    }

    return {
      connected: true,
      businessId,
      squareEnvironment: 'sandbox',
      squareMerchantId: merchantId,
      squareLocationId: locationId,
    };
  });
}

export default squareRoutes;
