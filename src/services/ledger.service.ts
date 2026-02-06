import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { LedgerEntryType } from '@prisma/client';

/**
 * Record points earned
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param points - Points earned (positive)
 * @param transactionId - Transaction ID
 */
export async function recordEarn(
  customerId: string,
  merchantId: string,
  points: number,
  transactionId: string
): Promise<string> {
  try {
    const entry = await prisma.ledgerEntry.create({
      data: {
        customerId,
        merchantId,
        type: LedgerEntryType.EARN,
        points,
        transactionId,
      },
    });

    logger.info(
      { entryId: entry.id, customerId, merchantId, points, transactionId },
      'Recorded points earned'
    );

    return entry.id;
  } catch (error) {
    logger.error({ error, customerId, merchantId }, 'Failed to record points earned');
    throw error;
  }
}

/**
 * Record points redeemed
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param points - Points redeemed (positive, will be stored as negative)
 * @param redemptionId - Redemption ID
 */
export async function recordRedeem(
  customerId: string,
  merchantId: string,
  points: number,
  redemptionId: string
): Promise<string> {
  try {
    const entry = await prisma.ledgerEntry.create({
      data: {
        customerId,
        merchantId,
        type: LedgerEntryType.REDEEM,
        points: -points, // Store as negative
        redemptionId,
      },
    });

    logger.info(
      { entryId: entry.id, customerId, merchantId, points, redemptionId },
      'Recorded points redeemed'
    );

    return entry.id;
  } catch (error) {
    logger.error({ error, customerId, merchantId }, 'Failed to record points redeemed');
    throw error;
  }
}

/**
 * Record points refunded
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param points - Points refunded (positive, will be stored as negative)
 * @param transactionId - Transaction ID
 */
export async function recordRefund(
  customerId: string,
  merchantId: string,
  points: number,
  transactionId: string
): Promise<string> {
  try {
    const entry = await prisma.ledgerEntry.create({
      data: {
        customerId,
        merchantId,
        type: LedgerEntryType.REFUND,
        points: -points, // Store as negative
        transactionId,
      },
    });

    logger.info(
      { entryId: entry.id, customerId, merchantId, points, transactionId },
      'Recorded points refunded'
    );

    return entry.id;
  } catch (error) {
    logger.error({ error, customerId, merchantId }, 'Failed to record points refunded');
    throw error;
  }
}

/**
 * Get customer ledger history
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param limit - Maximum number of entries to return
 * @param offset - Number of entries to skip
 */
export async function getCustomerLedger(
  customerId: string,
  merchantId: string,
  limit: number = 50,
  offset: number = 0
) {
  try {
    const entries = await prisma.ledgerEntry.findMany({
      where: {
        customerId,
        merchantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
      include: {
        transaction: {
          select: {
            id: true,
            amount: true,
            createdAt: true,
          },
        },
        redemption: {
          select: {
            id: true,
            reward: {
              select: {
                name: true,
              },
            },
            redeemedAt: true,
          },
        },
      },
    });

    return entries;
  } catch (error) {
    logger.error({ error, customerId, merchantId }, 'Failed to get customer ledger');
    throw error;
  }
}

/**
 * Recalculate customer balance from ledger
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @returns Recalculated balance
 */
export async function recalculateBalance(
  customerId: string,
  merchantId: string
): Promise<number> {
  try {
    const result = await prisma.ledgerEntry.aggregate({
      where: {
        customerId,
        merchantId,
      },
      _sum: {
        points: true,
      },
    });

    const balance = result._sum.points || 0;

    // Update CustomerBalance record
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
        points: balance,
      },
      update: {
        points: balance,
      },
    });

    logger.info({ customerId, merchantId, balance }, 'Recalculated customer balance');
    return balance;
  } catch (error) {
    logger.error({ error, customerId, merchantId }, 'Failed to recalculate balance');
    throw error;
  }
}
