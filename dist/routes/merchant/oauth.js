import { z } from 'zod';
import { POSProvider } from '@prisma/client';
import { getPOSProvider } from '../../pos/factory';
import { linkPOSIntegration, syncLocations } from '../../services/merchant.service';
import { logger } from '../../lib/logger';
import { env } from '../../config/env';
/**
 * Merchant OAuth routes
 */
export default async function merchantOAuthRoutes(fastify) {
    // Get Square OAuth URL
    fastify.get('/api/merchant/oauth/square', { preHandler: [fastify.authenticateMerchant] }, async (request, reply) => {
        try {
            const merchantId = request.merchantId;
            const provider = getPOSProvider(POSProvider.SQUARE);
            // Generate state for CSRF protection
            const state = `${merchantId}:${Date.now()}`;
            // Get redirect URI from query or use default
            const redirectUri = request.query.redirectUri ||
                `${env.NODE_ENV === 'production' ? 'https' : 'http'}://${request.headers.host}/api/merchant/oauth/square/callback`;
            const authUrl = provider.getAuthorizationUrl(redirectUri, state);
            reply.send({ authUrl, state });
        }
        catch (error) {
            logger.error({ error }, 'Error generating OAuth URL');
            throw error;
        }
    });
    // OAuth callback
    fastify.get('/api/merchant/oauth/square/callback', async (request, reply) => {
        try {
            const { code, state } = request.query;
            if (!code) {
                reply.code(400).send({ error: 'Missing authorization code' });
                return;
            }
            // Extract merchant ID from state
            let merchantId;
            if (state) {
                const [id] = state.split(':');
                if (!id) {
                    reply.code(400).send({ error: 'Invalid state parameter' });
                    return;
                }
                merchantId = id;
            }
            else {
                // If no state, try to get from session or require authentication
                // For now, we'll require the merchant to be authenticated
                reply.code(400).send({ error: 'Missing state parameter' });
                return;
            }
            const provider = getPOSProvider(POSProvider.SQUARE);
            // Get redirect URI
            const redirectUri = request.query.redirectUri ||
                `${env.NODE_ENV === 'production' ? 'https' : 'http'}://${request.headers.host}/api/merchant/oauth/square/callback`;
            // Exchange code for tokens
            const credentials = await provider.exchangeAuthCode(code, redirectUri);
            // Link integration
            const integration = await linkPOSIntegration(merchantId, POSProvider.SQUARE, credentials);
            // Sync locations automatically
            await syncLocations(merchantId, integration.id);
            reply.send({
                success: true,
                integration: {
                    id: integration.id,
                    provider: integration.provider,
                },
            });
        }
        catch (error) {
            logger.error({ error }, 'OAuth callback error');
            reply.code(500).send({ error: 'Failed to complete OAuth flow' });
        }
    });
}
//# sourceMappingURL=oauth.js.map