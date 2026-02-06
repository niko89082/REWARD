import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { POSProvider, TransactionStatus } from '@prisma/client';
import { getPOSProvider } from '../pos/factory';
import type { GenericWebhookEvent, LineItem } from '../pos/interfaces/IPOSProvider';
import { findOrCreateByCard } from './customer.service';
import { updateBalance } from './customer.service';
import { recordEarn, recordRefund } from './ledger.service';
import crypto from 'crypto';

/**
 * Calculate points based on transaction amount and merchant configuration
 * Default: 1 point per dollar (100 cents)
 */
function calculatePoints(amountCents: number, pointsPerDollar: number = 1): number {
  return Math.floor((amountCents / 100) * pointsPerDollar);
}

/**
 * Create card fingerprint from card data
 */
function createCardFingerprint(cardData: {
  last4: string;
  brand?: string;
  zipCode?: string;
}): string {
  const data = `${cardData.last4}:${cardData.brand || ''}:${cardData.zipCode || ''}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Process webhook event from POS system
 * @param provider - POS provider
 * @param payload - Webhook payload
 */
export async function processWebhookEvent(
  provider: POSProvider,
  payload: any
): Promise<void> {
  try {
    logger.info({ provider, eventType: payload.type }, 'Processing webhook event');

    // Get provider and parse webhook
    const posProvider = getPOSProvider(provider);
    const event = posProvider.parseWebhook(payload);

    // Handle different event types
    switch (event.type) {
      case 'payment.created':
      case 'payment.updated':
        await handlePaymentEvent(provider, event);
        break;
      case 'refund.created':
      case 'refund.updated':
        await handleRefundEvent(provider, event);
        break;
      default:
        logger.info({ eventType: event.type }, 'Unhandled webhook event type');
    }
  } catch (error) {
    logger.error({ error, provider }, 'Failed to process webhook event');
    throw error;
  }
}

/**
 * Handle payment event
 */
async function handlePaymentEvent(
  provider: POSProvider,
  event: GenericWebhookEvent
): Promise<void> {
  try {
    const paymentData = event.data.object;

    // Extract transaction ID
    const posTransactionId = paymentData.id || event.id;
    if (!posTransactionId) {
      logger.warn({ event }, 'Payment event missing transaction ID');
      return;
    }

    // Check idempotency - unique constraint on (posProvider, posTransactionId)
    const existing = await prisma.transaction.findUnique({
      where: {
        posProvider_posTransactionId: {
          posProvider: provider,
          posTransactionId,
        },
      },
    });

    if (existing) {
      logger.info(
        { posTransactionId, provider, transactionId: existing.id },
        'Transaction already processed (idempotency)'
      );
      return;
    }

    // Extract merchant ID from payment data
    // Square provides merchant_id in the event
    const merchantId = paymentData.merchant_id || event.data.merchant_id;
    if (!merchantId) {
      logger.warn({ event }, 'Payment event missing merchant ID');
      return;
    }

    // Find merchant by provider merchant ID
    const integration = await prisma.pOSIntegration.findFirst({
      where: {
        provider,
        providerMerchantId: merchantId,
      },
      include: {
        merchant: true,
      },
    });

    if (!integration) {
      logger.warn({ merchantId, provider }, 'Merchant not found for payment event');
      return;
    }

    // Extract amount
    const amountMoney = paymentData.amount_money || paymentData.total_money;
    const amountCents = amountMoney?.amount || 0;
    const amount = amountCents / 100;

    // Extract location ID
    const posLocationId = paymentData.location_id;
    let locationId: string | null = null;
    if (posLocationId) {
      const location = await prisma.location.findFirst({
        where: {
          posIntegrationId: integration.id,
          posLocationId,
        },
      });
      locationId = location?.id || null;
    }

    // Extract card information for customer matching
    const tender = paymentData.tenders?.[0];
    const cardData = tender?.card_details?.card;
    let customerId: string | null = null;

    if (cardData) {
      const cardFingerprint = createCardFingerprint({
        last4: cardData.last_4,
        brand: cardData.card_brand,
        zipCode: cardData.postal_code,
      });

      // Find or create customer by card
      customerId = await findOrCreateByCard(
        cardFingerprint,
        cardData.last_4,
        cardData.card_brand,
        provider
      );

      // Update linked card with zip code if available
      if (cardData.postal_code) {
        await prisma.linkedCard.updateMany({
          where: {
            customerId,
            last4: cardData.last_4,
            posProvider: provider,
          },
          data: {
            zipCode: cardData.postal_code,
          },
        });
      }
    }

    // Calculate points (default: 1 point per dollar)
    const pointsEarned = calculatePoints(amountCents, 1);

    // Create transaction
    const transaction = await prisma.transaction.create({
      data: {
        merchantId: integration.merchantId,
        customerId,
        locationId,
        posProvider: provider,
        posTransactionId,
        posLocationId,
        amount,
        pointsEarned,
        status: TransactionStatus.COMPLETED,
        metadata: paymentData,
      },
    });

    // Update customer balance and ledger if customer exists
    if (customerId && pointsEarned > 0) {
      await updateBalance(customerId, integration.merchantId, pointsEarned);
      await recordEarn(customerId, integration.merchantId, pointsEarned, transaction.id);
    }

    // Process line items for item-based rewards
    if (paymentData.itemizations || paymentData.line_items) {
      const lineItems: LineItem[] = (paymentData.itemizations || paymentData.line_items || []).map(
        (item: any) => ({
          id: item.uid || item.id,
          name: item.name || 'Unknown',
          quantity: parseInt(item.quantity || '1', 10),
          price: (item.base_price_money?.amount || 0) / 100,
          catalogObjectId: item.catalog_object_id,
          metadata: item,
        })
      );

      await processLineItems(
        customerId,
        integration.merchantId,
        lineItems
      );
    }

    logger.info(
      {
        transactionId: transaction.id,
        posTransactionId,
        customerId,
        pointsEarned,
      },
      'Payment event processed'
    );
  } catch (error) {
    logger.error({ error, provider, event }, 'Failed to handle payment event');
    throw error;
  }
}

/**
 * Handle refund event
 */
async function handleRefundEvent(
  provider: POSProvider,
  event: GenericWebhookEvent
): Promise<void> {
  try {
    const refundData = event.data.object;

    // Find original transaction
    const originalTransactionId = refundData.payment_id;
    if (!originalTransactionId) {
      logger.warn({ event }, 'Refund event missing payment ID');
      return;
    }

    const originalTransaction = await prisma.transaction.findFirst({
      where: {
        posProvider: provider,
        posTransactionId: originalTransactionId,
      },
    });

    if (!originalTransaction) {
      logger.warn(
        { originalTransactionId, provider },
        'Original transaction not found for refund'
      );
      return;
    }

    if (!originalTransaction.customerId) {
      logger.info({ originalTransactionId }, 'Refund for transaction without customer');
      return;
    }

    // Calculate refund amount
    const refundAmountMoney = refundData.amount_money;
    const refundAmountCents = refundAmountMoney?.amount || 0;
    const refundPoints = calculatePoints(refundAmountCents, 1);

    // Refund points (negative)
    await updateBalance(
      originalTransaction.customerId,
      originalTransaction.merchantId,
      -refundPoints
    );

    await recordRefund(
      originalTransaction.customerId,
      originalTransaction.merchantId,
      refundPoints,
      originalTransaction.id
    );

    // Update transaction status
    await prisma.transaction.update({
      where: { id: originalTransaction.id },
      data: {
        status: TransactionStatus.REFUNDED,
      },
    });

    logger.info(
      {
        transactionId: originalTransaction.id,
        refundPoints,
        customerId: originalTransaction.customerId,
      },
      'Refund event processed'
    );
  } catch (error) {
    logger.error({ error, provider, event }, 'Failed to handle refund event');
    throw error;
  }
}

/**
 * Process line items for item-based rewards
 */
async function processLineItems(
  customerId: string | null,
  merchantId: string,
  lineItems: LineItem[]
): Promise<void> {
  if (!customerId) {
    return;
  }

  try {
    // Get all item-based rewards for merchant
    const rewards = await prisma.reward.findMany({
      where: {
        merchantId,
        type: 'ITEM_BASED',
        isActive: true,
      },
    });

    for (const lineItem of lineItems) {
      // Match line item to reward by catalog object ID or name
      for (const reward of rewards) {
        if (!reward.itemName) {
          continue;
        }

        const matches =
          (lineItem.catalogObjectId &&
            (await prisma.pOSRewardItem.findFirst({
              where: {
                rewardId: reward.id,
                posItemId: lineItem.catalogObjectId,
              },
            }))) ||
          lineItem.name.toLowerCase().includes(reward.itemName.toLowerCase());

        if (matches) {
          // Update item count
          const itemCount = await prisma.customerItemCount.upsert({
            where: {
              customerId_merchantId_rewardId_itemName: {
                customerId,
                merchantId,
                rewardId: reward.id,
                itemName: reward.itemName,
              },
            },
            create: {
              customerId,
              merchantId,
              rewardId: reward.id,
              itemName: reward.itemName,
              count: lineItem.quantity,
            },
            update: {
              count: {
                increment: lineItem.quantity,
              },
            },
          });

          // Check if threshold reached
          if (reward.itemCount && itemCount.count >= reward.itemCount) {
            // Auto-generate redemption
            const { initiateRedemption } = await import('./redemption.service.js');
            await initiateRedemption(customerId, merchantId, reward.id);

            // Reset count
            await prisma.customerItemCount.update({
              where: {
                customerId_merchantId_rewardId_itemName: {
                  customerId,
                  merchantId,
                  rewardId: reward.id,
                  itemName: reward.itemName,
                },
              },
              data: {
                count: 0,
              },
            });

            logger.info(
              {
                customerId,
                merchantId,
                rewardId: reward.id,
                itemCount: itemCount.count,
              },
              'Item-based reward threshold reached, redemption auto-generated'
            );
          }
        }
      }
    }
  } catch (error) {
    logger.error({ error, customerId, merchantId }, 'Failed to process line items');
    // Don't throw - line item processing is not critical
  }
}
