import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class LedgerService {
  async createEarn({ userId, businessId, points, externalRef = null, metadata = {} }) {
    // Check for existing event if externalRef provided
    if (externalRef) {
      const existing = await prisma.ledgerEvent.findFirst({
        where: {
          businessId,
          type: 'EARN',
          externalRef,
        },
      });

      if (existing) {
        return existing;
      }
    }

    const metadataJson = {
      version: 1,
      source: metadata.source || 'manual',
      ...metadata,
    };

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
    // Check for existing event if externalRef provided
    if (externalRef) {
      const existing = await prisma.ledgerEvent.findFirst({
        where: {
          businessId,
          type: 'REDEEM',
          externalRef,
        },
      });

      if (existing) {
        return existing;
      }
    }

    const metadataJson = {
      version: 1,
      source: metadata.source || 'manual',
      ...metadata,
    };

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
