import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { RedemptionStatus } from '@prisma/client';
import { updateBalance } from './customer.service';
import { recordRedeem } from './ledger.service';

/**
 * Generate unique 6-digit PIN code
 */
function generatePIN(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Check if QR token is unique
 */
async function isQRTokenUnique(qrToken: string): Promise<boolean> {
  const existing = await prisma.redemption.findUnique({
    where: { qrToken },
  });
  return !existing;
}

/**
 * Check if PIN code is unique
 */
async function isPINUnique(pinCode: string): Promise<boolean> {
  const existing = await prisma.redemption.findUnique({
    where: { pinCode },
  });
  return !existing;
}

/**
 * Initiate redemption - generate QR token and PIN code
 * @param customerId - Customer ID
 * @param merchantId - Merchant ID
 * @param rewardId - Reward ID
 * @returns Redemption with QR token and PIN code
 */
export async function initiateRedemption(
  customerId: string,
  merchantId: string,
  rewardId: string
) {
  try {
    // Get reward details
    const reward = await prisma.reward.findUnique({
      where: { id: rewardId },
    });

    if (!reward) {
      throw new Error('Reward not found');
    }

    if (!reward.isActive) {
      throw new Error('Reward is not active');
    }

    if (reward.merchantId !== merchantId) {
      throw new Error('Reward does not belong to merchant');
    }

    // Check customer has enough points (for points-based rewards)
    if (reward.type === 'POINTS_BASED' && reward.pointsCost) {
      const { getBalance } = await import('./customer.service.js');
      const balance = await getBalance(customerId, merchantId);
      if (balance < reward.pointsCost) {
        throw new Error('Insufficient points');
      }
    }

    // Cancel any existing PENDING redemptions for same customer/merchant
    await prisma.redemption.updateMany({
      where: {
        customerId,
        merchantId,
        status: RedemptionStatus.PENDING,
      },
      data: {
        status: RedemptionStatus.CANCELLED,
      },
    });

    // Generate unique QR token and PIN
    let qrToken: string;
    let pinCode: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      qrToken = `qr_${nanoid(32)}`;
      attempts++;
      if (attempts > maxAttempts) {
        throw new Error('Failed to generate unique QR token');
      }
    } while (!(await isQRTokenUnique(qrToken)));

    attempts = 0;
    do {
      pinCode = generatePIN();
      attempts++;
      if (attempts > maxAttempts) {
        throw new Error('Failed to generate unique PIN code');
      }
    } while (!(await isPINUnique(pinCode)));

    // Create redemption
    const redemption = await prisma.redemption.create({
      data: {
        customerId,
        merchantId,
        rewardId,
        qrToken,
        pinCode,
        status: RedemptionStatus.PENDING,
      },
      include: {
        reward: {
          select: {
            name: true,
            description: true,
            type: true,
            pointsCost: true,
          },
        },
      },
    });

    logger.info(
      { redemptionId: redemption.id, customerId, merchantId, rewardId },
      'Redemption initiated'
    );

    return redemption;
  } catch (error) {
    logger.error({ error, customerId, merchantId, rewardId }, 'Failed to initiate redemption');
    throw error;
  }
}

/**
 * Verify redemption code (QR token or PIN)
 * @param code - QR token or PIN code
 * @param merchantId - Merchant ID
 * @returns Validation result with redemption details
 */
export async function verifyRedemption(code: string, merchantId: string) {
  try {
    // Try to find by QR token first, then by PIN
    const redemption = await prisma.redemption.findFirst({
      where: {
        merchantId,
        OR: [
          { qrToken: code },
          { pinCode: code },
        ],
      },
      include: {
        customer: {
          select: {
            id: true,
            phoneNumber: true,
          },
        },
        reward: {
          select: {
            id: true,
            name: true,
            description: true,
            type: true,
            pointsCost: true,
          },
        },
      },
    });

    if (!redemption) {
      return {
        valid: false,
        error: 'Redemption code not found',
      };
    }

    if (redemption.status === RedemptionStatus.REDEEMED) {
      return {
        valid: false,
        error: 'Redemption already used',
      };
    }

    if (redemption.status === RedemptionStatus.CANCELLED) {
      return {
        valid: false,
        error: 'Redemption has been cancelled',
      };
    }

    if (redemption.status === RedemptionStatus.EXPIRED) {
      return {
        valid: false,
        error: 'Redemption has expired',
      };
    }

    // Check customer has enough points (for points-based rewards)
    if (redemption.reward.type === 'POINTS_BASED' && redemption.reward.pointsCost) {
      const { getBalance } = await import('./customer.service.js');
      const balance = await getBalance(redemption.customerId, merchantId);
      if (balance < redemption.reward.pointsCost) {
        return {
          valid: false,
          error: 'Customer has insufficient points',
        };
      }
    }

    return {
      valid: true,
      redemption: {
        id: redemption.id,
        customer: redemption.customer,
        reward: redemption.reward,
        pointsCost: redemption.reward.pointsCost,
      },
    };
  } catch (error) {
    logger.error({ error, code, merchantId }, 'Failed to verify redemption');
    throw error;
  }
}

/**
 * Complete redemption - deduct points and mark as redeemed
 * @param redemptionId - Redemption ID
 * @param merchantId - Merchant ID
 */
export async function completeRedemption(
  redemptionId: string,
  merchantId: string
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      // Get redemption with lock
      const redemption = await tx.redemption.findUnique({
        where: { id: redemptionId },
        include: {
          reward: true,
        },
      });

      if (!redemption) {
        throw new Error('Redemption not found');
      }

      if (redemption.merchantId !== merchantId) {
        throw new Error('Redemption does not belong to merchant');
      }

      if (redemption.status !== RedemptionStatus.PENDING) {
        throw new Error(`Redemption is not pending (status: ${redemption.status})`);
      }

      // Deduct points if points-based reward
      if (redemption.reward.type === 'POINTS_BASED' && redemption.reward.pointsCost) {
        await updateBalance(
          redemption.customerId,
          merchantId,
          -redemption.reward.pointsCost
        );

        // Record in ledger
        await recordRedeem(
          redemption.customerId,
          merchantId,
          redemption.reward.pointsCost,
          redemptionId
        );
      }

      // Update redemption status
      await tx.redemption.update({
        where: { id: redemptionId },
        data: {
          status: RedemptionStatus.REDEEMED,
          pointsDeducted: redemption.reward.pointsCost || null,
          redeemedAt: new Date(),
        },
      });
    });

    logger.info({ redemptionId, merchantId }, 'Redemption completed');
  } catch (error) {
    logger.error({ error, redemptionId, merchantId }, 'Failed to complete redemption');
    throw error;
  }
}

/**
 * Cancel pending redemption
 * @param redemptionId - Redemption ID
 * @param customerId - Customer ID (for authorization)
 */
export async function cancelRedemption(
  redemptionId: string,
  customerId: string
): Promise<void> {
  try {
    const redemption = await prisma.redemption.findUnique({
      where: { id: redemptionId },
    });

    if (!redemption) {
      throw new Error('Redemption not found');
    }

    if (redemption.customerId !== customerId) {
      throw new Error('Redemption does not belong to customer');
    }

    if (redemption.status !== RedemptionStatus.PENDING) {
      throw new Error('Can only cancel pending redemptions');
    }

    await prisma.redemption.update({
      where: { id: redemptionId },
      data: {
        status: RedemptionStatus.CANCELLED,
      },
    });

    logger.info({ redemptionId, customerId }, 'Redemption cancelled');
  } catch (error) {
    logger.error({ error, redemptionId, customerId }, 'Failed to cancel redemption');
    throw error;
  }
}
