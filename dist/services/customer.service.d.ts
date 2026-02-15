import { POSProvider } from '@prisma/client';
/**
 * Find or create customer by card fingerprint
 * @param cardFingerprint - Hash of card for matching
 * @param last4 - Last 4 digits of card
 * @param brand - Card brand (e.g., "VISA", "MASTERCARD")
 * @param posProvider - POS provider
 * @returns Customer ID
 */
export declare function findOrCreateByCard(cardFingerprint: string, last4: string, brand: string | null, posProvider: POSProvider): Promise<string>;
/**
 * Link card to customer using last4 and zip code verification
 * @param customerId - Customer ID
 * @param last4 - Last 4 digits of card
 * @param zipCode - Zip code for verification
 * @returns Linked card ID
 */
export declare function linkCardToCustomer(customerId: string, last4: string, zipCode: string): Promise<string>;
/**
 * Update customer balance
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param pointsDelta - Points to add (positive) or subtract (negative)
 */
export declare function updateBalance(customerId: string, merchantId: string, pointsDelta: number): Promise<void>;
/**
 * Get customer balance
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @returns Current balance in points
 */
export declare function getBalance(customerId: string, merchantId: string): Promise<number>;
/**
 * Get customer by phone number
 * @param phoneNumber - Phone number in E.164 format
 * @returns Customer or null
 */
export declare function getCustomerByPhone(phoneNumber: string): Promise<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    phoneNumber: string | null;
} | null>;
/**
 * Create customer with phone number
 * @param phoneNumber - Phone number in E.164 format
 * @returns Customer ID
 */
export declare function createCustomerWithPhone(phoneNumber: string): Promise<string>;
//# sourceMappingURL=customer.service.d.ts.map