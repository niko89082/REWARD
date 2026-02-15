import { POSProvider } from '@prisma/client';
/**
 * Generic line item from POS system
 */
export interface LineItem {
    id: string;
    name: string;
    quantity: number;
    price: number;
    catalogObjectId?: string;
    metadata?: Record<string, any>;
}
/**
 * Generic location from POS system
 */
export interface GenericLocation {
    id: string;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    metadata?: Record<string, any>;
}
/**
 * Generic transaction from POS system
 */
export interface GenericTransaction {
    id: string;
    locationId?: string;
    amount: number;
    currency: string;
    lineItems: LineItem[];
    customerId?: string;
    paymentMethod?: string;
    metadata?: Record<string, any>;
    createdAt: Date;
}
/**
 * Generic webhook event from POS system
 */
export interface GenericWebhookEvent {
    type: string;
    id: string;
    data: any;
    timestamp: Date;
}
/**
 * OAuth credentials returned after authorization
 */
export interface OAuthCredentials {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    merchantId: string;
    metadata?: Record<string, any>;
}
/**
 * Generic POS Provider Interface
 * All POS providers must implement this interface
 */
export interface IPOSProvider {
    /**
     * Get the provider type
     */
    readonly provider: POSProvider;
    /**
     * Get OAuth authorization URL
     * @param redirectUri - Callback URL after authorization
     * @param state - Optional state parameter for CSRF protection
     */
    getAuthorizationUrl(redirectUri: string, state?: string): string;
    /**
     * Exchange authorization code for access token
     * @param code - Authorization code from OAuth callback
     * @param redirectUri - Same redirect URI used in authorization URL
     */
    exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthCredentials>;
    /**
     * Refresh access token using refresh token
     * @param refreshToken - Refresh token
     */
    refreshAccessToken(refreshToken: string): Promise<OAuthCredentials>;
    /**
     * Verify webhook signature
     * @param payload - Raw webhook payload
     * @param signature - Signature header from webhook request
     * @param secret - Webhook signature secret
     */
    verifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): boolean;
    /**
     * Parse webhook payload into generic format
     * @param payload - Raw webhook payload
     */
    parseWebhook(payload: any): GenericWebhookEvent;
    /**
     * Fetch locations from POS system
     * @param accessToken - Decrypted access token
     */
    fetchLocations(accessToken: string): Promise<GenericLocation[]>;
    /**
     * Fetch transactions from POS system
     * @param accessToken - Decrypted access token
     * @param locationId - Optional location ID to filter by
     * @param startDate - Start date for transaction query
     * @param endDate - End date for transaction query
     */
    fetchTransactions(accessToken: string, locationId?: string, startDate?: Date, endDate?: Date): Promise<GenericTransaction[]>;
    /**
     * Create reward item in POS catalog (optional)
     * @param accessToken - Decrypted access token
     * @param itemData - Item data to create
     */
    createRewardItem?(accessToken: string, itemData: {
        name: string;
        description?: string;
        price?: number;
        metadata?: Record<string, any>;
    }): Promise<{
        id: string;
        metadata?: Record<string, any>;
    }>;
    /**
     * Update reward item in POS catalog (optional)
     * @param accessToken - Decrypted access token
     * @param itemId - Item ID in POS system
     * @param itemData - Item data to update
     */
    updateRewardItem?(accessToken: string, itemId: string, itemData: {
        name?: string;
        description?: string;
        price?: number;
        metadata?: Record<string, any>;
    }): Promise<void>;
    /**
     * Delete reward item from POS catalog (optional)
     * @param accessToken - Decrypted access token
     * @param itemId - Item ID in POS system
     */
    deleteRewardItem?(accessToken: string, itemId: string): Promise<void>;
}
//# sourceMappingURL=IPOSProvider.d.ts.map