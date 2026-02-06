import { SquareClient, SquareEnvironment } from 'square';
import crypto from 'crypto';
import { POSProvider } from '@prisma/client';
import type { IPOSProvider, GenericWebhookEvent, GenericLocation, GenericTransaction, LineItem, OAuthCredentials } from '../../interfaces/IPOSProvider';
import { logger } from '../../../lib/logger';
import { env } from '../../../config/env';
import type {
  SquareOAuthResponse,
  SquareWebhookEvent,
  SquareLocation,
  SquareTransaction,
} from './types';

/**
 * Square POS Provider Implementation
 */
export class SquareProvider implements IPOSProvider {
  readonly provider: POSProvider = POSProvider.SQUARE;
  private readonly applicationId: string;
  private readonly environment: SquareEnvironment;
  private readonly baseUrl: string;

  constructor() {
    this.applicationId = env.SQUARE_APPLICATION_ID;
    this.environment = env.SQUARE_ENVIRONMENT === 'production' 
      ? SquareEnvironment.Production 
      : SquareEnvironment.Sandbox;
    this.baseUrl = this.environment === SquareEnvironment.Production
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: this.applicationId,
      response_type: 'code',
      session: 'false',
      scope: [
        'MERCHANT_PROFILE_READ',
        'PAYMENTS_READ',
        'PAYMENTS_WRITE',
        'ORDERS_READ',
        'ORDERS_WRITE',
        'ITEMS_READ',
        'ITEMS_WRITE',
        'LOCATIONS_READ',
      ].join(' '),
      redirect_uri: redirectUri,
    });

    if (state) {
      params.append('state', state);
    }

    return `${this.baseUrl}/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthCredentials> {
    try {
      logger.info({ provider: 'Square' }, 'Exchanging authorization code for tokens');

      const response = await fetch(`${this.baseUrl}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Square-Version': '2024-01-18',
        },
        body: JSON.stringify({
          client_id: this.applicationId,
          client_secret: env.SQUARE_ACCESS_TOKEN, // Note: In production, use separate client secret
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Square OAuth error: ${JSON.stringify(error)}`);
      }

      const data: SquareOAuthResponse = await response.json();

      logger.info({ merchantId: data.merchant_id }, 'Successfully exchanged Square auth code');

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_at ? this.parseExpiresAt(data.expires_at) : undefined,
        merchantId: data.merchant_id,
        metadata: {
          tokenType: data.token_type,
        },
      };
    } catch (error) {
      logger.error({ error, provider: 'Square' }, 'Failed to exchange Square auth code');
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthCredentials> {
    try {
      logger.info({ provider: 'Square' }, 'Refreshing Square access token');

      const response = await fetch(`${this.baseUrl}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Square-Version': '2024-01-18',
        },
        body: JSON.stringify({
          client_id: this.applicationId,
          client_secret: env.SQUARE_ACCESS_TOKEN,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Square token refresh error: ${JSON.stringify(error)}`);
      }

      const data: SquareOAuthResponse = await response.json();

      logger.info({ merchantId: data.merchant_id }, 'Successfully refreshed Square token');

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_at ? this.parseExpiresAt(data.expires_at) : undefined,
        merchantId: data.merchant_id,
        metadata: {
          tokenType: data.token_type,
        },
      };
    } catch (error) {
      logger.error({ error, provider: 'Square' }, 'Failed to refresh Square token');
      throw error;
    }
  }

  /**
   * Verify webhook signature using HMAC
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean {
    try {
      const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payloadString);
      const expectedSignature = hmac.digest('base64');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error({ error }, 'Error verifying Square webhook signature');
      return false;
    }
  }

  /**
   * Parse Square webhook into generic format
   */
  parseWebhook(payload: any): GenericWebhookEvent {
    const event: SquareWebhookEvent = payload;
    
    return {
      type: event.type,
      id: event.event_id,
      data: event.data,
      timestamp: new Date(event.created_at),
    };
  }

  /**
   * Fetch locations from Square
   */
  async fetchLocations(accessToken: string): Promise<GenericLocation[]> {
    try {
      logger.info({ provider: 'Square' }, 'Fetching Square locations');

      const client = new SquareClient({
        accessToken,
        environment: this.environment,
      });

      const response = await client.locationsApi.listLocations();

      if (response.result.errors && response.result.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(response.result.errors)}`);
      }

      const locations: GenericLocation[] = (response.result.locations || []).map(
        (loc: SquareLocation) => ({
          id: loc.id,
          name: loc.name,
          address: loc.address?.address_line_1,
          city: loc.address?.locality,
          state: loc.address?.administrative_district_level_1,
          zipCode: loc.address?.postal_code,
          country: loc.address?.country,
          metadata: {
            squareLocation: loc,
          },
        })
      );

      logger.info({ count: locations.length, provider: 'Square' }, 'Fetched Square locations');

      return locations;
    } catch (error) {
      logger.error({ error, provider: 'Square' }, 'Failed to fetch Square locations');
      throw error;
    }
  }

  /**
   * Fetch transactions from Square
   */
  async fetchTransactions(
    accessToken: string,
    locationId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<GenericTransaction[]> {
    try {
      logger.info(
        { provider: 'Square', locationId, startDate, endDate },
        'Fetching Square transactions'
      );

      const client = new SquareClient({
        accessToken,
        environment: this.environment,
      });

      const query: any = {};
      if (locationId) {
        query.location_ids = [locationId];
      }
      if (startDate) {
        query.begin_time = startDate.toISOString();
      }
      if (endDate) {
        query.end_time = endDate.toISOString();
      }

      const response = await client.paymentsApi.listPayments(query);

      if (response.result.errors && response.result.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(response.result.errors)}`);
      }

      // Square payments don't include line items directly, so we need to fetch orders
      // For now, we'll create transactions from payments
      const transactions: GenericTransaction[] = (response.result.payments || []).map(
        (payment: any) => {
          const amount = payment.amountMoney?.amount || 0;
          const currency = payment.amountMoney?.currency || 'USD';

          return {
            id: payment.id,
            locationId: payment.locationId,
            amount: amount / 100, // Square amounts are in cents
            currency,
            lineItems: [], // Will be populated from orders if needed
            customerId: payment.customerId,
            paymentMethod: payment.sourceType,
            metadata: {
              squarePayment: payment,
            },
            createdAt: new Date(payment.createdAt),
          };
        }
      );

      logger.info(
        { count: transactions.length, provider: 'Square' },
        'Fetched Square transactions'
      );

      return transactions;
    } catch (error) {
      logger.error({ error, provider: 'Square' }, 'Failed to fetch Square transactions');
      throw error;
    }
  }

  /**
   * Create reward item in Square catalog
   */
  async createRewardItem(
    accessToken: string,
    itemData: {
      name: string;
      description?: string;
      price?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<{ id: string; metadata?: Record<string, any> }> {
    try {
      logger.info({ provider: 'Square', itemData }, 'Creating Square catalog item');

      const client = new SquareClient({
        accessToken,
        environment: this.environment,
      });

      const catalogObject = {
        type: 'ITEM' as const,
        itemData: {
          name: itemData.name,
          description: itemData.description,
          variations: itemData.price
            ? [
                {
                  type: 'ITEM_VARIATION' as const,
                  itemVariationData: {
                    name: 'Default',
                    pricingType: 'FIXED_PRICING' as const,
                    priceMoney: {
                      amount: Math.round(itemData.price * 100), // Convert to cents
                      currency: 'USD',
                    },
                  },
                },
              ]
            : [],
        },
      };

      const response = await client.catalogApi.upsertCatalogObject({
        idempotencyKey: crypto.randomUUID(),
        object: catalogObject,
      });

      if (response.result.errors && response.result.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(response.result.errors)}`);
      }

      const catalogObj = response.result.catalogObject;
      if (!catalogObj) {
        throw new Error('No catalog object returned from Square');
      }

      logger.info(
        { itemId: catalogObj.id, provider: 'Square' },
        'Created Square catalog item'
      );

      return {
        id: catalogObj.id,
        metadata: {
          squareCatalogObject: catalogObj,
        },
      };
    } catch (error) {
      logger.error({ error, provider: 'Square' }, 'Failed to create Square catalog item');
      throw error;
    }
  }

  /**
   * Update reward item in Square catalog
   */
  async updateRewardItem(
    accessToken: string,
    itemId: string,
    itemData: {
      name?: string;
      description?: string;
      price?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      logger.info({ provider: 'Square', itemId, itemData }, 'Updating Square catalog item');

      const client = new SquareClient({
        accessToken,
        environment: this.environment,
      });

      // First, retrieve the current object
      const getResponse = await client.catalogApi.retrieveCatalogObject(itemId, true);
      
      if (getResponse.result.errors && getResponse.result.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(getResponse.result.errors)}`);
      }

      const currentObj = getResponse.result.object;
      if (!currentObj || !currentObj.itemData) {
        throw new Error('Catalog object not found or not an item');
      }

      // Update the object
      const updatedObj = {
        ...currentObj,
        itemData: {
          ...currentObj.itemData,
          name: itemData.name ?? currentObj.itemData.name,
          description: itemData.description ?? currentObj.itemData.description,
        },
      };

      const response = await client.catalogApi.upsertCatalogObject({
        idempotencyKey: crypto.randomUUID(),
        object: updatedObj,
      });

      if (response.result.errors && response.result.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(response.result.errors)}`);
      }

      logger.info({ itemId, provider: 'Square' }, 'Updated Square catalog item');
    } catch (error) {
      logger.error({ error, provider: 'Square' }, 'Failed to update Square catalog item');
      throw error;
    }
  }

  /**
   * Delete reward item from Square catalog
   */
  async deleteRewardItem(accessToken: string, itemId: string): Promise<void> {
    try {
      logger.info({ provider: 'Square', itemId }, 'Deleting Square catalog item');

      const client = new SquareClient({
        accessToken,
        environment: this.environment,
      });

      const response = await client.catalogApi.deleteCatalogObject(itemId);

      if (response.result.errors && response.result.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(response.result.errors)}`);
      }

      logger.info({ itemId, provider: 'Square' }, 'Deleted Square catalog item');
    } catch (error) {
      logger.error({ error, provider: 'Square' }, 'Failed to delete Square catalog item');
      throw error;
    }
  }

  /**
   * Parse Square expires_at timestamp
   */
  private parseExpiresAt(expiresAt: string): number {
    // Square returns ISO 8601 timestamp
    const expires = new Date(expiresAt);
    const now = new Date();
    return Math.floor((expires.getTime() - now.getTime()) / 1000); // Convert to seconds
  }
}
