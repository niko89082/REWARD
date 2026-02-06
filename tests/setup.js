import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll } from '@jest/globals';

const prisma = new PrismaClient();

/**
 * Clean all test data from the database.
 * This ensures each test run starts with a clean state.
 * 
 * Deletion order respects foreign key constraints:
 * 1. Child tables first (ExternalEvent, UserSquareLink, Redemption, LedgerEvent)
 * 2. Parent tables (Reward, RewardProgram)
 * 3. Root tables (Business, User)
 */
async function cleanDatabase() {
  try {
    // Delete in order: child tables first, then parent tables
    await prisma.externalEvent.deleteMany({});
    await prisma.userSquareLink.deleteMany({});
    await prisma.redemption.deleteMany({});
    await prisma.ledgerEvent.deleteMany({});
    await prisma.reward.deleteMany({});
    await prisma.rewardProgram.deleteMany({});
    await prisma.business.deleteMany({});
    await prisma.user.deleteMany({});
  } catch (error) {
    console.error('Error cleaning database:', error);
    // Don't throw - allow tests to continue even if cleanup fails
  }
}

/**
 * Global setup: Clean database before all tests run
 * This runs once per test worker (Jest runs tests in parallel workers)
 */
beforeAll(async () => {
  await cleanDatabase();
});

/**
 * Global teardown: Disconnect Prisma client to avoid hanging
 * This runs once per test worker after all tests complete
 */
afterAll(async () => {
  await prisma.$disconnect();
});
