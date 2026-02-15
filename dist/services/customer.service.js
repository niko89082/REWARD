import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { POSProvider } from '@prisma/client';
import crypto from 'crypto';
/**
 * Find or create customer by card fingerprint
 * @param cardFingerprint - Hash of card for matching
 * @param last4 - Last 4 digits of card
 * @param brand - Card brand (e.g., "VISA", "MASTERCARD")
 * @param posProvider - POS provider
 * @returns Customer ID
 */
export async function findOrCreateByCard(cardFingerprint, last4, brand, posProvider) {
    try {
        // First, try to find existing linked card
        const linkedCard = await prisma.linkedCard.findUnique({
            where: {
                cardFingerprint_posProvider: {
                    cardFingerprint,
                    posProvider,
                },
            },
            include: {
                customer: true,
            },
        });
        if (linkedCard) {
            logger.info({ customerId: linkedCard.customerId, cardFingerprint }, 'Found existing customer by card');
            return linkedCard.customerId;
        }
        // Create new anonymous customer and link card
        const result = await prisma.$transaction(async (tx) => {
            const customer = await tx.customer.create({
                data: {},
            });
            await tx.linkedCard.create({
                data: {
                    customerId: customer.id,
                    cardFingerprint,
                    last4,
                    brand: brand || null,
                    posProvider,
                },
            });
            return customer.id;
        });
        logger.info({ customerId: result, cardFingerprint }, 'Created new customer by card');
        return result;
    }
    catch (error) {
        logger.error({ error, cardFingerprint }, 'Failed to find or create customer by card');
        throw error;
    }
}
/**
 * Link card to customer using last4 and zip code verification
 * @param customerId - Customer ID
 * @param last4 - Last 4 digits of card
 * @param zipCode - Zip code for verification
 * @returns Linked card ID
 */
export async function linkCardToCustomer(customerId, last4, zipCode) {
    try {
        // Find card by last4 and zipCode
        const linkedCard = await prisma.linkedCard.findFirst({
            where: {
                last4,
                zipCode,
                customer: {
                    id: customerId,
                },
            },
        });
        if (!linkedCard) {
            throw new Error('Card not found or zip code does not match');
        }
        logger.info({ customerId, linkedCardId: linkedCard.id }, 'Card linked to customer');
        return linkedCard.id;
    }
    catch (error) {
        logger.error({ error, customerId, last4 }, 'Failed to link card to customer');
        throw error;
    }
}
/**
 * Update customer balance
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param pointsDelta - Points to add (positive) or subtract (negative)
 */
export async function updateBalance(customerId, merchantId, pointsDelta) {
    try {
        await prisma.customerBalance.upsert({
            where: {
                customerId_merchantId: {
                    customerId,
                    merchantId,
                },
            },
            create: {
                customerId,
                merchantId,
                points: pointsDelta,
            },
            update: {
                points: {
                    increment: pointsDelta,
                },
            },
        });
        logger.info({ customerId, merchantId, pointsDelta }, 'Updated customer balance');
    }
    catch (error) {
        logger.error({ error, customerId, merchantId }, 'Failed to update customer balance');
        throw error;
    }
}
/**
 * Get customer balance
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @returns Current balance in points
 */
export async function getBalance(customerId, merchantId) {
    try {
        const balance = await prisma.customerBalance.findUnique({
            where: {
                customerId_merchantId: {
                    customerId,
                    merchantId,
                },
            },
        });
        return balance?.points || 0;
    }
    catch (error) {
        logger.error({ error, customerId, merchantId }, 'Failed to get customer balance');
        throw error;
    }
}
/**
 * Get customer by phone number
 * @param phoneNumber - Phone number in E.164 format
 * @returns Customer or null
 */
export async function getCustomerByPhone(phoneNumber) {
    try {
        const customer = await prisma.customer.findUnique({
            where: {
                phoneNumber,
            },
        });
        return customer;
    }
    catch (error) {
        logger.error({ error, phoneNumber }, 'Failed to get customer by phone');
        throw error;
    }
}
/**
 * Create customer with phone number
 * @param phoneNumber - Phone number in E.164 format
 * @returns Customer ID
 */
export async function createCustomerWithPhone(phoneNumber) {
    try {
        const customer = await prisma.customer.create({
            data: {
                phoneNumber,
            },
        });
        logger.info({ customerId: customer.id, phoneNumber }, 'Created customer with phone');
        return customer.id;
    }
    catch (error) {
        logger.error({ error, phoneNumber }, 'Failed to create customer with phone');
        throw error;
    }
}
//# sourceMappingURL=customer.service.js.map