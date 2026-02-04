import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { ledgerService } from '../../src/services/ledger.js';
import { redemptionService } from '../../src/services/redemption.js';

const prisma = new PrismaClient();

describe('RedemptionService', () => {
  let userId;
  let businessId;
  let rewardId;

  beforeAll(async () => {
    // Create test user and business
    const user = await prisma.user.create({
      data: { phoneE164: '+15555559998' },
    });
    userId = user.id;

    const business = await prisma.business.create({
      data: {
        name: 'Test Business Redemption',
        latitude: 0,
        longitude: 0,
      },
    });
    businessId = business.id;

    // Create reward
    const reward = await prisma.reward.create({
      data: {
        businessId,
        type: 'FREE_ITEM',
        configJson: {
          version: 1,
          displayName: 'Test Reward',
          squareCatalogObjectId: 'TEST_ITEM',
          squareDiscountName: 'Reward: Test Reward',
        },
        costPoints: 100,
        enabled: true,
      },
    });
    rewardId = reward.id;

    // Give user points
    await ledgerService.createEarn({
      userId,
      businessId,
      points: 500,
      metadata: { source: 'test' },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.redemption.deleteMany({ where: { userId, businessId } });
    await prisma.ledgerEvent.deleteMany({ where: { userId, businessId } });
    await prisma.reward.delete({ where: { id: rewardId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('should fail if insufficient points', async () => {
    // Create user with no points
    const poorUser = await prisma.user.create({
      data: { phoneE164: '+15555559997' },
    });

    await expect(
      redemptionService.createRedemption({
        userId: poorUser.id,
        businessId,
        rewardId,
      })
    ).rejects.toThrow('Insufficient points');

    await prisma.user.delete({ where: { id: poorUser.id } });
  });

  it('should lock token once; second verify fails', async () => {
    const redemption = await redemptionService.createRedemption({
      userId,
      businessId,
      rewardId,
    });

    // First verify should succeed
    const first = await redemptionService.verifyAndLockToken({
      businessId,
      token: redemption.token,
    });
    expect(first.status).toBe('IN_PROGRESS');

    // Second verify should fail
    await expect(
      redemptionService.verifyAndLockToken({
        businessId,
        token: redemption.token,
      })
    ).rejects.toThrow('not pending');
  });

  it('should deduct points exactly once (idempotent)', async () => {
    // Create new redemption
    const redemption = await redemptionService.createRedemption({
      userId,
      businessId,
      rewardId,
    });

    // Get initial balance
    const initialBalance = await ledgerService.getBalance({ userId, businessId });

    // Verify and confirm
    await redemptionService.verifyAndLockToken({
      businessId,
      token: redemption.token,
    });

    // First confirm
    await redemptionService.confirmRedemption({
      redemptionId: redemption.id,
    });

    const balanceAfterFirst = await ledgerService.getBalance({ userId, businessId });
    expect(balanceAfterFirst).toBe(initialBalance - 100);

    // Second confirm (should be idempotent)
    await redemptionService.confirmRedemption({
      redemptionId: redemption.id,
    });

    const balanceAfterSecond = await ledgerService.getBalance({ userId, businessId });
    expect(balanceAfterSecond).toBe(balanceAfterFirst); // Should not change
  });

  it('should error if status is CANCELED', async () => {
    const redemption = await redemptionService.createRedemption({
      userId,
      businessId,
      rewardId,
    });

    // Cancel it
    await prisma.redemption.update({
      where: { id: redemption.id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
    });

    // Try to confirm - should fail
    await expect(
      redemptionService.confirmRedemption({
        redemptionId: redemption.id,
      })
    ).rejects.toThrow('Cannot confirm a canceled redemption');
  });

  it('should cancel expired redemptions without deducting', async () => {
    // Create redemption
    const redemption = await redemptionService.createRedemption({
      userId,
      businessId,
      rewardId,
    });

    // Get initial balance
    const initialBalance = await ledgerService.getBalance({ userId, businessId });

    // Expire it
    await prisma.redemption.update({
      where: { id: redemption.id },
      data: {
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      },
    });

    // Cancel expired
    const count = await redemptionService.cancelExpiredRedemptions();
    expect(count).toBeGreaterThan(0);

    // Balance should not change
    const finalBalance = await ledgerService.getBalance({ userId, businessId });
    expect(finalBalance).toBe(initialBalance);
  });
});
