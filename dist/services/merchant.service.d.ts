import { POSProvider, RewardType } from '@prisma/client';
/**
 * Create merchant account
 * @param data - Merchant data
 */
export declare function createMerchant(data: {
    email: string;
    password: string;
    name: string;
}): Promise<{
    id: string;
    createdAt: Date;
    name: string;
    email: string;
}>;
/**
 * Verify merchant password
 * @param email - Merchant email
 * @param password - Plain text password
 * @returns Merchant if password is correct, null otherwise
 */
export declare function verifyMerchantPassword(email: string, password: string): Promise<{
    id: string;
    email: string;
    name: string;
    createdAt: Date;
} | null>;
/**
 * Get merchant by ID
 * @param merchantId - Merchant ID
 */
export declare function getMerchantById(merchantId: string): Promise<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    email: string;
} | null>;
/**
 * Link POS integration to merchant
 * @param merchantId - Merchant ID
 * @param provider - POS provider
 * @param credentials - OAuth credentials
 */
export declare function linkPOSIntegration(merchantId: string, provider: POSProvider, credentials: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    merchantId: string;
}): Promise<{
    provider: import(".prisma/client").$Enums.POSProvider;
    merchantId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    accessToken: string;
    refreshToken: string | null;
    providerMerchantId: string;
    expiresAt: Date | null;
}>;
/**
 * Refresh access token
 * @param integrationId - POS integration ID
 */
export declare function refreshAccessToken(integrationId: string): Promise<{
    provider: import(".prisma/client").$Enums.POSProvider;
    merchantId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    accessToken: string;
    refreshToken: string | null;
    providerMerchantId: string;
    expiresAt: Date | null;
}>;
/**
 * Sync locations from POS system
 * @param merchantId - Merchant ID
 * @param posIntegrationId - POS integration ID
 */
export declare function syncLocations(merchantId: string, posIntegrationId: string): Promise<void>;
/**
 * Create reward
 * @param merchantId - Merchant ID
 * @param rewardData - Reward data
 */
export declare function createReward(merchantId: string, rewardData: {
    name: string;
    description?: string;
    type: RewardType;
    pointsCost?: number;
    itemName?: string;
    itemCount?: number;
}): Promise<{
    merchant: {
        id: string;
        name: string;
    };
} & {
    type: import(".prisma/client").$Enums.RewardType;
    merchantId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    description: string | null;
    pointsCost: number | null;
    itemName: string | null;
    itemCount: number | null;
    isActive: boolean;
}>;
/**
 * Get merchant rewards
 * @param merchantId - Merchant ID
 * @param includeInactive - Include inactive rewards
 */
export declare function getMerchantRewards(merchantId: string, includeInactive?: boolean): Promise<({
    posRewardItems: {
        id: string;
        posProvider: "SQUARE";
        posItemId: string;
    }[];
} & {
    type: import(".prisma/client").$Enums.RewardType;
    merchantId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    description: string | null;
    pointsCost: number | null;
    itemName: string | null;
    itemCount: number | null;
    isActive: boolean;
})[]>;
/**
 * Update reward
 * @param rewardId - Reward ID
 * @param merchantId - Merchant ID (for authorization)
 * @param rewardData - Reward data to update
 */
export declare function updateReward(rewardId: string, merchantId: string, rewardData: {
    name?: string;
    description?: string;
    pointsCost?: number;
    itemName?: string;
    itemCount?: number;
    isActive?: boolean;
}): Promise<{
    type: import(".prisma/client").$Enums.RewardType;
    merchantId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    description: string | null;
    pointsCost: number | null;
    itemName: string | null;
    itemCount: number | null;
    isActive: boolean;
}>;
/**
 * Sync reward to POS catalog
 * @param rewardId - Reward ID
 * @param merchantId - Merchant ID (for authorization)
 */
export declare function syncRewardToPOS(rewardId: string, merchantId: string): Promise<void>;
//# sourceMappingURL=merchant.service.d.ts.map