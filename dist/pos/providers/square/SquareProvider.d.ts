import { POSProvider } from '@prisma/client';
import type { IPOSProvider, GenericWebhookEvent, GenericLocation, GenericTransaction, OAuthCredentials } from '../../interfaces/IPOSProvider';
/**
 * Square POS Provider Implementation
 */
export declare class SquareProvider implements IPOSProvider {
    readonly provider: POSProvider;
    private readonly applicationId;
    private readonly environment;
    private readonly baseUrl;
    constructor();
    /**
     * Get OAuth authorization URL
     */
    getAuthorizationUrl(redirectUri: string, state?: string): string;
    /**
     * Exchange authorization code for access token
     */
    exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthCredentials>;
    /**
     * Refresh access token
     */
    refreshAccessToken(refreshToken: string): Promise<OAuthCredentials>;
    /**
     * Verify webhook signature using HMAC
     */
    verifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): boolean;
    /**
     * Parse Square webhook into generic format
     */
    parseWebhook(payload: any): GenericWebhookEvent;
    /**
     * Fetch locations from Square
     */
    fetchLocations(accessToken: string): Promise<GenericLocation[]>;
    /**
     * Fetch transactions from Square
     */
    fetchTransactions(accessToken: string, locationId?: string, startDate?: Date, endDate?: Date): Promise<GenericTransaction[]>;
    /**
     * Create reward item in Square catalog
     */
    createRewardItem(accessToken: string, itemData: {
        name: string;
        description?: string;
        price?: number;
        metadata?: Record<string, any>;
    }): Promise<{
        id: string;
        metadata?: Record<string, any>;
    }>;
    /**
     * Update reward item in Square catalog
     */
    updateRewardItem(accessToken: string, itemId: string, itemData: {
        name?: string;
        description?: string;
        price?: number;
        metadata?: Record<string, any>;
    }): Promise<void>;
    /**
     * Delete reward item from Square catalog
     */
    deleteRewardItem(accessToken: string, itemId: string): Promise<void>;
    /**
     * Parse Square expires_at timestamp
     */
    private parseExpiresAt;
}
//# sourceMappingURL=SquareProvider.d.ts.map