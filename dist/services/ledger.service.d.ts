/**
 * Record points earned
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param points - Points earned (positive)
 * @param transactionId - Transaction ID
 */
export declare function recordEarn(customerId: string, merchantId: string, points: number, transactionId: string): Promise<string>;
/**
 * Record points redeemed
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param points - Points redeemed (positive, will be stored as negative)
 * @param redemptionId - Redemption ID
 */
export declare function recordRedeem(customerId: string, merchantId: string, points: number, redemptionId: string): Promise<string>;
/**
 * Record points refunded
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param points - Points refunded (positive, will be stored as negative)
 * @param transactionId - Transaction ID
 */
export declare function recordRefund(customerId: string, merchantId: string, points: number, transactionId: string): Promise<string>;
/**
 * Get customer ledger history
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param limit - Maximum number of entries to return
 * @param offset - Number of entries to skip
 */
export declare function getCustomerLedger(customerId: string, merchantId: string, limit?: number, offset?: number): Promise<({
    transaction: {
        id: string;
        createdAt: Date;
        amount: import("@prisma/client/runtime/library").Decimal;
    } | null;
    redemption: {
        id: string;
        reward: {
            name: string;
        };
        redeemedAt: Date | null;
    } | null;
} & {
    type: import(".prisma/client").$Enums.LedgerEntryType;
    merchantId: string;
    id: string;
    customerId: string;
    createdAt: Date;
    points: number;
    transactionId: string | null;
    redemptionId: string | null;
})[]>;
/**
 * Recalculate customer balance from ledger
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @returns Recalculated balance
 */
export declare function recalculateBalance(customerId: string, merchantId: string): Promise<number>;
//# sourceMappingURL=ledger.service.d.ts.map