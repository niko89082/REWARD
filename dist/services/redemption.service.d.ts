/**
 * Initiate redemption - generate QR token and PIN code
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param rewardId - Reward ID
 * @returns Redemption with QR token and PIN code
 */
export declare function initiateRedemption(customerId: string, merchantId: string, rewardId: string): Promise<{
    reward: {
        type: import(".prisma/client").$Enums.RewardType;
        name: string;
        description: string | null;
        pointsCost: number | null;
    };
} & {
    status: import(".prisma/client").$Enums.RedemptionStatus;
    merchantId: string;
    id: string;
    customerId: string;
    createdAt: Date;
    updatedAt: Date;
    rewardId: string;
    qrToken: string;
    pinCode: string;
    pointsDeducted: number | null;
    redeemedAt: Date | null;
}>;
/**
 * Verify redemption code (QR token or PIN)
 * @param code - QR token or PIN code
 * @param merchantId - Merchant ID
 * @returns Validation result with redemption details
 */
export declare function verifyRedemption(code: string, merchantId: string): Promise<{
    valid: boolean;
    error: string;
    redemption?: never;
} | {
    valid: boolean;
    redemption: {
        id: string;
        customer: {
            id: string;
            phoneNumber: string | null;
        };
        reward: {
            type: import(".prisma/client").$Enums.RewardType;
            name: string;
            id: string;
            description: string | null;
            pointsCost: number | null;
        };
        pointsCost: number | null;
    };
    error?: never;
}>;
/**
 * Complete redemption - deduct points and mark as redeemed
 * @param redemptionId - Redemption ID
 * @param merchantId - Merchant ID
 */
export declare function completeRedemption(redemptionId: string, merchantId: string): Promise<void>;
/**
 * Cancel pending redemption
 * @param redemptionId - Redemption ID
 * @param customerId - Customer ID (for authorization)
 */
export declare function cancelRedemption(redemptionId: string, customerId: string): Promise<void>;
//# sourceMappingURL=redemption.service.d.ts.map