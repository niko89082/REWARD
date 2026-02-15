import { SquareClient, SquareEnvironment } from 'square';
import crypto from 'crypto';
import { POSProvider } from '@prisma/client';
import type { IPOSProvider, GenericWebhookEvent, GenericLocation, GenericTransaction, LineItem, OAuthCredentials } from '../../interfaces/IPOSProvider';
import { logger } from '../../../lib/logger';
import { env } from '../../../config/env';
import type {
  SquareOAuthResponse,
  SquareWebhookEvent,
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

      const data = (await response.json()) as SquareOAuthResponse;

      logger.info({ merchantId: data.merchant_id }, 'Successfully exchanged Square auth code');

      const credentials: OAuthCredentials = {
        accessToken: data.access_token,
        merchantId: data.merchant_id,
        metadata: {
          tokenType: data.token_type,
        },
      };
      if (data.refresh_token !== undefined) {
        credentials.refreshToken = data.refresh_token;
      }
      if (data.expires_at !== undefined) {
        credentials.expiresIn = this.parseExpiresAt(data.expires_at);
      }
      return credentials;
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

      const data = (await response.json()) as SquareOAuthResponse;

      logger.info({ merchantId: data.merchant_id }, 'Successfully refreshed Square token');

      const credentials: OAuthCredentials = {
        accessToken: data.access_token,
        merchantId: data.merchant_id,
        metadata: {
          tokenType: data.token_type,
        },
      };
      if (data.refresh_token !== undefined) {
        credentials.refreshToken = data.refresh_token;
      }
      if (data.expires_at !== undefined) {
        credentials.expiresIn = this.parseExpiresAt(data.expires_at);
      }
      return credentials;
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
        token: accessToken,
        environment: this.environment,
      });

      const response = await client.locations.list();

      if (response.errors && response.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(response.errors)}`);
      }

      const locations: GenericLocation[] = (response.locations || []).map(
        (loc) => {
          const result: GenericLocation = {
            id: loc.id ?? '',
            name: loc.name ?? '',
            metadata: {
              squareLocation: loc,
            },
          };
          if (loc.address?.addressLine1 != null) result.address = loc.address.addressLine1;
          if (loc.address?.locality != null) result.city = loc.address.locality;
          if (loc.address?.administrativeDistrictLevel1 != null) result.state = loc.address.administrativeDistrictLevel1;
          if (loc.address?.postalCode != null) result.zipCode = loc.address.postalCode;
          if (loc.address?.country != null) result.country = loc.address.country;
          return result;
        }
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
        token: accessToken,
        environment: this.environment,
      });

      const listRequest: {
        beginTime?: string;
        endTime?: string;
        locationId?: string;
      } = {};
      if (startDate) {
        listRequest.beginTime = startDate.toISOString();
      }
      if (endDate) {
        listRequest.endTime = endDate.toISOString();
      }
      if (locationId) {
        listRequest.locationId = locationId;
      }

      const page = await client.payments.list(listRequest);

      if (page.response?.errors && page.response.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(page.response.errors)}`);
      }

      // Square payments don't include line items directly, so we need to fetch orders
      // For now, we'll create transactions from payments
      const transactions: GenericTransaction[] = (page.data || []).map((payment) => {
        const amount = payment.amountMoney?.amount ?? 0;
        const currency = payment.amountMoney?.currency ?? 'USD';

        const result: GenericTransaction = {
          id: payment.id ?? '',
          amount: Number(amount) / 100, // Square amounts are in cents
          currency: typeof currency === 'string' ? currency : 'USD',
          lineItems: [], // Will be populated from orders if needed
          metadata: {
            squarePayment: payment,
          },
          createdAt: new Date(payment.createdAt ?? Date.now()),
        };
        if (payment.locationId != null) result.locationId = payment.locationId;
        if (payment.customerId != null) result.customerId = payment.customerId;
        if (payment.sourceType != null) result.paymentMethod = payment.sourceType;
        return result;
      });

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
        token: accessToken,
        environment: this.environment,
      });

      const catalogObject = {
        type: 'ITEM' as const,
        id: '#temp',
        itemData: {
          name: itemData.name,
          description: itemData.description ?? null,
          variations: itemData.price
            ? [
                {
                  type: 'ITEM_VARIATION' as const,
                  id: '#tempvar',
                  itemVariationData: {
                    name: 'Default',
                    pricingType: 'FIXED_PRICING' as const,
                    priceMoney: {
                      amount: BigInt(Math.round(itemData.price * 100)), // Convert to cents
                      currency: 'USD' as const,
                    },
                  },
                },
              ]
            : [],
        },
      };

      const response = await client.catalog.object.upsert({
        idempotencyKey: crypto.randomUUID(),
        object: catalogObject,
      });

      if (response.errors && response.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(response.errors)}`);
      }

      const catalogObj = response.catalogObject;
      if (!catalogObj) {
        throw new Error('No catalog object returned from Square');
      }

      logger.info(
        { itemId: catalogObj.id, provider: 'Square' },
        'Created Square catalog item'
      );

      return {
        id: catalogObj?.id ?? '',
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
        token: accessToken,
        environment: this.environment,
      });

      // First, retrieve the current object
      const getResponse = await client.catalog.object.get({
        objectId: itemId,
        includeRelatedObjects: true,
      });

      if (getResponse.errors && getResponse.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(getResponse.errors)}`);
      }

      const currentObj = getResponse.object;
      if (!currentObj || !('itemData' in currentObj) || !currentObj.itemData) {
        throw new Error('Catalog object not found or not an item');
      }

      const itemObj = currentObj as typeof currentObj & { itemData: NonNullable<typeof currentObj.itemData> };

      // Update the object
      const updatedObj = {
        ...currentObj,
        itemData: {
          ...itemObj.itemData,
          name: itemData.name ?? itemObj.itemData.name ?? null,
          description: itemData.description ?? itemObj.itemData.description ?? null,
        },
      };

      const response = await client.catalog.object.upsert({
        idempotencyKey: crypto.randomUUID(),
        object: updatedObj,
      });

      if (response.errors && response.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(response.errors)}`);
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
        token: accessToken,
        environment: this.environment,
      });

      const response = await client.catalog.object.delete({
        objectId: itemId,
      });

      if (response.errors && response.errors.length > 0) {
        throw new Error(`Square API error: ${JSON.stringify(response.errors)}`);
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
