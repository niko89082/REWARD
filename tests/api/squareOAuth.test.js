import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../../src/server.js';
import { closeRedis } from '../../src/services/redis.js';
import { makeSquareClient } from '../../src/integrations/squareClient.js';

const prisma = new PrismaClient();

describe('Square OAuth endpoints', () => {
  let fastify;
  let businessId;
  let mockSquareClient;

  beforeAll(async () => {
    // Create mock Square client with mock functions
    mockSquareClient = {
      exchangeCodeForToken: async () => {
        throw new Error('exchangeCodeForToken not mocked');
      },
      getMerchantAndLocations: async () => {
        throw new Error('getMerchantAndLocations not mocked');
      },
    };

    // Build server with injected mock client
    fastify = await buildServer({ squareClient: mockSquareClient });
    await fastify.ready();

    // Create a test business
    const business = await prisma.business.create({
      data: {
        name: 'Test OAuth Business',
        latitude: 37.7749,
        longitude: -122.4194,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    // Cleanup
    if (businessId) {
      // Delete related records first
      await prisma.ledgerEvent.deleteMany({ where: { businessId } });
      await prisma.redemption.deleteMany({ where: { businessId } });
      await prisma.reward.deleteMany({ where: { businessId } });
      await prisma.rewardProgram.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    await fastify.close();
    await closeRedis();
    await prisma.$disconnect();
  });

  describe('GET /square/oauth/start', () => {
    it('should redirect to Square authorization URL with correct params', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: `/square/oauth/start?businessId=${businessId}`,
      });

      expect(response.statusCode).toBe(302);
      const location = response.headers.location;
      
      expect(location).toContain('connect.squareupsandbox.com/oauth2/authorize');
      expect(location).toContain('client_id=');
      expect(location).toContain('redirect_uri=');
      expect(location).toContain('state=');
      expect(location).toContain('scope=');
      expect(location).toContain('session=false');
    });

    it('should return 404 for non-existent business', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/square/oauth/start?businessId=nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('business_not_found');
    });

    it('should return 400 if businessId is missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/square/oauth/start',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /square/oauth/callback', () => {
    let stateFromStart;

    beforeAll(async () => {
      // Call /square/oauth/start to get a valid state
      const startResponse = await fastify.inject({
        method: 'GET',
        url: `/square/oauth/start?businessId=${businessId}`,
      });

      // Extract state from redirect URL
      const location = startResponse.headers.location;
      const url = new URL(location);
      stateFromStart = url.searchParams.get('state');
    });

    it('should successfully complete OAuth flow and update business', async () => {
      // Mock token exchange response
      mockSquareClient.exchangeCodeForToken = async () => ({
        access_token: 'test_access_token_123',
        refresh_token: 'test_refresh_token_456',
        merchant_id: 'm123',
        expires_at: '2030-01-01T00:00:00Z',
      });

      // Mock merchant and locations response
      mockSquareClient.getMerchantAndLocations = async () => ({
        merchant: { id: 'm123' },
        locations: [
          { id: 'L_ACTIVE', status: 'ACTIVE' },
          { id: 'L2', status: 'INACTIVE' },
        ],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: `/square/oauth/callback?code=test_code_abc&state=${stateFromStart}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.connected).toBe(true);
      expect(body.businessId).toBe(businessId);
      expect(body.squareEnvironment).toBe('sandbox');
      expect(body.squareMerchantId).toBe('m123');
      expect(body.squareLocationId).toBe('L_ACTIVE'); // Should choose ACTIVE location

      // Verify business was updated in database
      const updatedBusiness = await prisma.business.findUnique({
        where: { id: businessId },
      });

      expect(updatedBusiness.squareMerchantId).toBe('m123');
      expect(updatedBusiness.squareLocationId).toBe('L_ACTIVE');
      expect(updatedBusiness.squareAccessToken).toBe('test_access_token_123');
      expect(updatedBusiness.squareRefreshToken).toBe('test_refresh_token_456');
      expect(updatedBusiness.squareEnvironment).toBe('sandbox');
      expect(updatedBusiness.squareConnectedAt).not.toBeNull();
      expect(updatedBusiness.squareTokenExpiresAt).not.toBeNull();
    });

    it('should return 400 for invalid state', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/square/oauth/callback?code=test_code&state=invalid_state_xyz',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('invalid_state');
    });

    it('should return 400 if error param is present', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/square/oauth/callback?error=access_denied&error_description=User%20denied',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('square_oauth_error');
      expect(body.detail).toBe('access_denied');
    });

    it('should choose first location if no ACTIVE location exists', async () => {
      // Get a new state
      const startResponse = await fastify.inject({
        method: 'GET',
        url: `/square/oauth/start?businessId=${businessId}`,
      });
      const location = startResponse.headers.location;
      const url = new URL(location);
      const newState = url.searchParams.get('state');

      // Mock locations with no ACTIVE
      mockSquareClient.exchangeCodeForToken = async () => ({
        access_token: 'test_token_2',
        refresh_token: 'test_refresh_2',
        merchant_id: 'm456',
      });

      mockSquareClient.getMerchantAndLocations = async () => ({
        merchant: { id: 'm456' },
        locations: [
          { id: 'L_INACTIVE_1', status: 'INACTIVE' },
          { id: 'L_INACTIVE_2', status: 'INACTIVE' },
        ],
      });

      const response = await fastify.inject({
        method: 'GET',
        url: `/square/oauth/callback?code=test_code_2&state=${newState}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.squareLocationId).toBe('L_INACTIVE_1'); // First location
    });
  });

  describe('GET /merchant/status', () => {
    it('should return connected:false before OAuth callback', async () => {
      // Create a fresh business for this test
      const freshBusiness = await prisma.business.create({
        data: {
          name: 'Status Test Business',
          latitude: 37.7749,
          longitude: -122.4194,
        },
      });

      const response = await fastify.inject({
        method: 'GET',
        url: `/merchant/status?businessId=${freshBusiness.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.connected).toBe(false);

      // Cleanup
      await prisma.business.delete({ where: { id: freshBusiness.id } });
    });

    it('should return connected:true after OAuth callback', async () => {
      // Re-connect the business (previous test may have overwritten it)
      const startResponse = await fastify.inject({
        method: 'GET',
        url: `/square/oauth/start?businessId=${businessId}`,
      });
      const location = startResponse.headers.location;
      const url = new URL(location);
      const state = url.searchParams.get('state');

      // Mock with m123 data
      mockSquareClient.exchangeCodeForToken = async () => ({
        access_token: 'test_access_token_123',
        refresh_token: 'test_refresh_token_456',
        merchant_id: 'm123',
        expires_at: '2030-01-01T00:00:00Z',
      });

      mockSquareClient.getMerchantAndLocations = async () => ({
        merchant: { id: 'm123' },
        locations: [
          { id: 'L_ACTIVE', status: 'ACTIVE' },
          { id: 'L2', status: 'INACTIVE' },
        ],
      });

      // Complete OAuth flow
      await fastify.inject({
        method: 'GET',
        url: `/square/oauth/callback?code=test_code_reconnect&state=${state}`,
      });

      // Now check status
      const response = await fastify.inject({
        method: 'GET',
        url: `/merchant/status?businessId=${businessId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.connected).toBe(true);
      expect(body.squareEnvironment).toBe('sandbox');
      expect(body.squareMerchantId).toBe('m123');
      expect(body.squareLocationId).toBe('L_ACTIVE');
    });

    it('should return 404 for non-existent business', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/merchant/status?businessId=nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('business_not_found');
    });

    it('should return 400 if businessId is missing', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/merchant/status',
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
