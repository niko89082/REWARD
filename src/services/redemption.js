import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ledgerService } from './ledger.js';

const prisma = new PrismaClient();

function generateToken() {
  return randomBytes(32).toString('hex');
}

export class RedemptionService {
  async createRedemption({ userId, businessId, rewardId }) {
    // Validate reward exists and enabled
    const reward = await prisma.reward.findFirst({
      where: {
        id: rewardId,
        businessId,
        enabled: true,
      },
    });

    if (!reward) {
      throw new Error('Reward not found or not enabled');
    }

    // Check balance
    const balance = await ledgerService.getBalance({ userId, businessId });
    if (balance < reward.costPoints) {
      throw new Error(`Insufficient points. Required: ${reward.costPoints}, Available: ${balance}`);
    }

    // Create redemption (DO NOT deduct points here)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    return await prisma.redemption.create({
      data: {
        userId,
        businessId,
        rewardId,
        status: 'PENDING',
        token: generateToken(),
        expiresAt,
      },
    });
  }

  async verifyAndLockToken({ businessId, token }) {
    const redemption = await prisma.redemption.findUnique({
      where: { token },
      include: { reward: true },
    });

    if (!redemption) {
      throw new Error('Invalid token');
    }

    if (redemption.businessId !== businessId) {
      throw new Error('Token does not match business');
    }

    if (redemption.status !== 'PENDING') {
      throw new Error(`Redemption is not pending. Current status: ${redemption.status}`);
    }

    if (new Date() >= redemption.expiresAt) {
      throw new Error('Token has expired');
    }

    // Lock the redemption (single-use)
    const updated = await prisma.redemption.update({
      where: { id: redemption.id },
      data: {
        status: 'IN_PROGRESS',
        lockedAt: new Date(),
      },
      include: { reward: true },
    });

    return updated;
  }

  async confirmRedemption({ redemptionId, providerPaymentId = null, providerOrderId = null }) {
    return await prisma.$transaction(async (tx) => {
      // Load redemption + reward
      const redemption = await tx.redemption.findUnique({
        where: { id: redemptionId },
        include: { reward: true },
      });

      if (!redemption) {
        throw new Error('Redemption not found');
      }

      // Safety rules
      if (redemption.status === 'CONFIRMED') {
        // Already confirmed - idempotent return
        return redemption;
      }

      if (redemption.status === 'CANCELED') {
        throw new Error('Cannot confirm a canceled redemption');
      }

      if (redemption.status !== 'IN_PROGRESS') {
        throw new Error(`Redemption must be IN_PROGRESS to confirm. Current status: ${redemption.status}`);
      }

      if (new Date() >= redemption.expiresAt) {
        throw new Error('Redemption has expired');
      }

      // Update redemption status
      const updated = await tx.redemption.update({
        where: { id: redemptionId },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          providerPaymentId,
          providerOrderId,
        },
        include: { reward: true },
      });

      // Deduct points via ledger
      await ledgerService.createRedeem({
        userId: redemption.userId,
        businessId: redemption.businessId,
        points: redemption.reward.costPoints,
        metadata: {
          source: 'manual',
          redemptionId: redemption.id,
        },
      });

      return updated;
    });
  }

  async cancelExpiredRedemptions() {
    const now = new Date();
    const result = await prisma.redemption.updateMany({
      where: {
        status: {
          in: ['PENDING', 'IN_PROGRESS'],
        },
        expiresAt: {
          lt: now,
        },
      },
      data: {
        status: 'CANCELED',
        canceledAt: now,
      },
    });

    return result.count;
  }
}

export const redemptionService = new RedemptionService();
