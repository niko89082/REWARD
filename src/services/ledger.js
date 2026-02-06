import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class LedgerService {
  async createEarn({ userId, businessId, points, externalRef = null, metadata = {} }) {
    const metadataJson = {
      version: 1,
      source: metadata.source || 'manual',
      ...metadata,
    };

    // If externalRef provided, use unique constraint for idempotency
    if (externalRef) {
      // Try to find existing event first
      const existing = await prisma.ledgerEvent.findUnique({
        where: {
          businessId_type_externalRef: {
            businessId,
            type: 'EARN',
            externalRef,
          },
        },
      });

      if (existing) {
        return existing;
      }

      // Create with unique constraint - will fail if duplicate (handled by constraint)
      try {
        return await prisma.ledgerEvent.create({
          data: {
            userId,
            businessId,
            type: 'EARN',
            pointsDelta: points,
            externalRef,
            metadataJson,
          },
        });
      } catch (error) {
        // Handle unique constraint violation (race condition)
        if (error.code === 'P2002') {
          // Retry fetch
          const existing = await prisma.ledgerEvent.findUnique({
            where: {
              businessId_type_externalRef: {
                businessId,
                type: 'EARN',
                externalRef,
              },
            },
          });
          if (existing) {
            return existing;
          }
        }
        throw error;
      }
    }

    // No externalRef - create without idempotency check
    return await prisma.ledgerEvent.create({
      data: {
        userId,
        businessId,
        type: 'EARN',
        pointsDelta: points,
        externalRef,
        metadataJson,
      },
    });
  }

  async createRedeem({ userId, businessId, points, externalRef = null, metadata = {} }) {
    const metadataJson = {
      version: 1,
      source: metadata.source || 'manual',
      ...metadata,
    };

    // If externalRef provided, use unique constraint for idempotency
    if (externalRef) {
      // Try to find existing event first
      const existing = await prisma.ledgerEvent.findUnique({
        where: {
          businessId_type_externalRef: {
            businessId,
            type: 'REDEEM',
            externalRef,
          },
        },
      });

      if (existing) {
        return existing;
      }

      // Create with unique constraint - will fail if duplicate (handled by constraint)
      try {
        return await prisma.ledgerEvent.create({
          data: {
            userId,
            businessId,
            type: 'REDEEM',
            pointsDelta: -points,
            externalRef,
            metadataJson,
          },
        });
      } catch (error) {
        // Handle unique constraint violation (race condition)
        if (error.code === 'P2002') {
          // Retry fetch
          const existing = await prisma.ledgerEvent.findUnique({
            where: {
              businessId_type_externalRef: {
                businessId,
                type: 'REDEEM',
                externalRef,
              },
            },
          });
          if (existing) {
            return existing;
          }
        }
        throw error;
      }
    }

    // No externalRef - create without idempotency check
    return await prisma.ledgerEvent.create({
      data: {
        userId,
        businessId,
        type: 'REDEEM',
        pointsDelta: -points,
        externalRef,
        metadataJson,
      },
    });
  }

  async getBalance({ userId, businessId }) {
    const result = await prisma.ledgerEvent.aggregate({
      where: {
        userId,
        businessId,
      },
      _sum: {
        pointsDelta: true,
      },
    });

    return result._sum.pointsDelta || 0;
  }
}

export const ledgerService = new LedgerService();
