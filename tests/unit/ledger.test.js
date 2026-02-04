import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { ledgerService } from '../../src/services/ledger.js';

const prisma = new PrismaClient();

describe('LedgerService', () => {
  let userId;
  let businessId;

  beforeAll(async () => {
    // Create test user and business
    const user = await prisma.user.create({
      data: { phoneE164: '+15555559999' },
    });
    userId = user.id;

    const business = await prisma.business.create({
      data: {
        name: 'Test Business',
        latitude: 0,
        longitude: 0,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.ledgerEvent.deleteMany({ where: { userId, businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('should sum balance correctly', async () => {
    // Create multiple earn events
    await ledgerService.createEarn({ userId, businessId, points: 100 });
    await ledgerService.createEarn({ userId, businessId, points: 50 });
    await ledgerService.createEarn({ userId, businessId, points: 25 });

    const balance = await ledgerService.getBalance({ userId, businessId });
    expect(balance).toBe(175);
  });

  it('should be idempotent with same externalRef', async () => {
    const externalRef = 'test-external-ref-123';
    
    const first = await ledgerService.createEarn({
      userId,
      businessId,
      points: 200,
      externalRef,
    });

    const second = await ledgerService.createEarn({
      userId,
      businessId,
      points: 200,
      externalRef,
    });

    // Should return the same event
    expect(first.id).toBe(second.id);

    // Balance should only reflect one earn
    const balance = await ledgerService.getBalance({ userId, businessId });
    expect(balance).toBe(375); // 175 + 200 (only one counted)
  });
});
