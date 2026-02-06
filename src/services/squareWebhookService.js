import { PrismaClient } from '@prisma/client';
import { ledgerService } from './ledger.js';
import { confirmRedemption } from './redemption.js';
import { validateEarnParamsJson } from '../validators/rewardProgram.js';
import { computePoints } from './earn/computePoints.js';

const prisma = new PrismaClient();

export class SquareWebhookService {
  /**
   * Process a Square webhook event stored in ExternalEvent.
   * This method is idempotent and never throws - errors are stored in ExternalEvent.
   * 
   * @param {string} externalEventId - ExternalEvent ID to process
   */
  async processEvent(externalEventId) {
    try {
      // Load ExternalEvent
      const externalEvent = await prisma.externalEvent.findUnique({
        where: { id: externalEventId },
      });

      if (!externalEvent) {
        // Event not found - this shouldn't happen, but handle gracefully
        return;
      }

      // If already processed or failed, skip
      if (externalEvent.status !== 'RECEIVED') {
        return;
      }

      // Parse payload
      const payload = externalEvent.payloadJson;
      if (!payload || typeof payload !== 'object') {
        await this._markFailed(externalEventId, 'Invalid payload format');
        return;
      }

      const eventType = payload.type || payload.event_type || externalEvent.eventType;
      
      // Only handle payment events
      if (!eventType || !eventType.startsWith('payment.')) {
        // Not a payment event - mark as processed (no-op)
        await this._markProcessed(externalEventId);
        return;
      }

      // Extract payment from payload
      const payment = payload.data?.object?.payment;
      if (!payment) {
        await this._markFailed(externalEventId, 'Payment data not found in payload');
        return;
      }

      // Process payment event
      await this._processPaymentEvent(externalEventId, payment, payload);
    } catch (error) {
      // Never throw - always mark as failed
      await this._markFailed(externalEventId, error.message || 'Unknown error');
    }
  }

  /**
   * Process a payment event from webhook payload.
   * @private
   */
  async _processPaymentEvent(externalEventId, payment, payload) {
    // Check payment status
    if (payment.status !== 'COMPLETED') {
      // Not completed - mark as processed (no-op)
      await this._markProcessed(externalEventId);
      return;
    }

    // Resolve business from location_id
    const locationId = payment.location_id;
    if (!locationId) {
      await this._markFailed(externalEventId, 'Payment missing location_id');
      return;
    }

    const business = await this._resolveBusinessFromLocationId(locationId);
    if (!business) {
      await this._markFailed(externalEventId, 'business_not_found');
      return;
    }

    // Update ExternalEvent with businessId for better tracking
    await prisma.externalEvent.update({
      where: { id: externalEventId },
      data: { businessId: business.id },
    });

    // Check for customer_id
    const squareCustomerId = payment.customer_id;
    if (!squareCustomerId || squareCustomerId === null || squareCustomerId === undefined) {
      // No customer - mark as processed (no-op, not an error)
      await this._markProcessed(externalEventId);
      return;
    }

    // Find UserSquareLink
    const userSquareLink = await prisma.userSquareLink.findUnique({
      where: {
        businessId_squareCustomerId: {
          businessId: business.id,
          squareCustomerId,
        },
      },
    });

    if (!userSquareLink) {
      // No link - mark as processed (no-op, not an error)
      await this._markProcessed(externalEventId);
      return;
    }

    // Load RewardProgram
    const rewardProgram = await prisma.rewardProgram.findFirst({
      where: {
        businessId: business.id,
        earnType: 'POINTS_PER_DOLLAR',
        enabled: true,
      },
    });

    if (!rewardProgram) {
      await this._markFailed(externalEventId, 'reward_program_not_found');
      return;
    }

    // Validate and parse earnParamsJson
    let earnParams;
    try {
      earnParams = validateEarnParamsJson('POINTS_PER_DOLLAR', rewardProgram.earnParamsJson);
    } catch (err) {
      await this._markFailed(externalEventId, `Invalid reward program config: ${err.message}`);
      return;
    }

    // Extract amount
    let amountCents = 0;
    if (payment.amount_money?.amount) {
      amountCents = payment.amount_money.amount;
    } else if (payment.approved_money?.amount) {
      amountCents = payment.approved_money.amount;
    } else {
      await this._markFailed(externalEventId, 'payment_amount_missing');
      return;
    }

    // Compute points
    const pointsResult = computePoints({
      amountCents,
      pointsPerDollar: earnParams.pointsPerDollar,
      minSubtotalCents: earnParams.minSubtotalCents,
      rounding: earnParams.rounding,
    });

    if (!pointsResult.eligible) {
      // Below minimum - mark as processed (no-op)
      await this._markProcessed(externalEventId);
      return;
    }

    // Create ledger event (idempotent via externalRef)
    // Use same format as /earn/claim: "square:payment:{paymentId}"
    const externalRef = `square:payment:${payment.id}`;
    const ledgerEvent = await ledgerService.createEarn({
      userId: userSquareLink.userId,
      businessId: business.id,
      points: pointsResult.points,
      externalRef,
      metadata: {
        version: 1,
        source: 'square_webhook',
        external: {
          paymentId: payment.id,
          orderId: payment.order_id || null,
        },
      },
    });

    // Attempt auto-confirm (Phase 5) - always attempt, even if points were already awarded
    await this._attemptAutoConfirm({
      payment,
      businessId: business.id,
      userId: userSquareLink.userId,
    });

    // Mark as processed
    await this._markProcessed(externalEventId);
  }

  /**
   * Resolve Business from Square location_id.
   * @private
   */
  async _resolveBusinessFromLocationId(locationId) {
    return await prisma.business.findFirst({
      where: {
        squareLocationId: locationId,
      },
    });
  }

  /**
   * Attempt to auto-confirm a redemption when payment completes.
   * Idempotent by paymentId: if any confirmed redemption already has
   * providerPaymentId==paymentId, skip re-processing (do not deduct balance again).
   * 
   * On payment status COMPLETED: resolve user via UserSquareLink (businessId + squareCustomerId),
   * then find matching IN_PROGRESS redemptions. Deterministically select by:
   * 1. Prefer redemption already linked to this paymentId (shouldn't happen, but handle gracefully)
   * 2. If none linked, select the oldest IN_PROGRESS redemption (deterministic by createdAt)
   * 
   * Uses the shared confirmRedemption function for consistency.
   * All operations are synchronous and atomic via Prisma transaction.
   * @private
   */
  async _attemptAutoConfirm({ payment, businessId, userId }) {
    try {
      // Extract paymentId and orderId from payment object (structure: payload.data.object.payment)
      // Ensure we extract from the correct structure: payment.id and payment.order_id
      const paymentId = payment?.id;
      const orderId = payment?.order_id || null;
      
      if (!paymentId) {
        // Payment ID is required for auto-confirm
        if (process.env.NODE_ENV === 'test') {
          console.error('[SquareWebhookService._attemptAutoConfirm] Payment ID missing from payment object');
        }
        return;
      }
      
      // Idempotency guard: check if ANY confirmed redemption already has this paymentId for this business
      // If found and already CONFIRMED, return/no-op (do not deduct balance again)
      // Check by unique constraint (businessId, providerPaymentId)
      const existingConfirmed = await prisma.redemption.findFirst({
        where: {
          businessId,
          providerPaymentId: paymentId,
          status: 'CONFIRMED',
        },
      });
      
      if (existingConfirmed) {
        // Already processed this payment - skip (idempotent)
        if (process.env.NODE_ENV === 'test') {
          console.log(`[SquareWebhookService._attemptAutoConfirm] Payment ${paymentId} already confirmed (idempotent)`);
        }
        return;
      }

      // Find IN_PROGRESS redemptions for this user/business
      // Must match: userId, businessId, status=IN_PROGRESS, not expired, providerPaymentId=null
      const now = new Date();
      const candidates = await prisma.redemption.findMany({
        where: {
          userId,
          businessId,
          status: 'IN_PROGRESS',
          expiresAt: {
            gt: now, // Not expired
          },
          providerPaymentId: null, // Not already linked to a payment
        },
        orderBy: {
          createdAt: 'asc', // Deterministic: oldest first
        },
      });

      // If no candidates, nothing to confirm
      if (candidates.length === 0) {
        if (process.env.NODE_ENV === 'test') {
          console.log(`[SquareWebhookService._attemptAutoConfirm] No IN_PROGRESS redemptions found for payment ${paymentId}`);
        }
        return;
      }

      // Deterministic selection: use the oldest redemption (first in sorted list)
      const redemption = candidates[0];

      if (process.env.NODE_ENV === 'test') {
        console.log(`[SquareWebhookService._attemptAutoConfirm] Attempting to confirm redemption ${redemption.id} for payment ${paymentId} (selected from ${candidates.length} candidates)`);
      }

      // Use the shared confirmRedemption function with Prisma transaction
      // This ensures idempotency via externalRef and atomic updates
      // The transaction ensures status update + ledger write are atomic
      // AWAIT ensures transaction completes synchronously before webhook responds
      // In test mode, this makes the DB update visible immediately
      const confirmed = await confirmRedemption({
        prisma,
        redemptionId: redemption.id,
        providerPaymentId: paymentId,
        providerOrderId: orderId,
      });
      
      // Verify confirmation succeeded (transaction is now committed)
      // In test mode, this helps catch issues early
      if (process.env.NODE_ENV === 'test') {
        if (confirmed.status !== 'CONFIRMED') {
          console.error(`[SquareWebhookService._attemptAutoConfirm] Redemption ${redemption.id} was not confirmed. Status: ${confirmed.status}`);
        } else {
          console.log(`[SquareWebhookService._attemptAutoConfirm] Successfully confirmed redemption ${redemption.id}`);
        }
      }
    } catch (error) {
      // Never throw - log but continue
      // Errors are caught to prevent webhook from failing
      // In test mode, log errors to help debug issues
      if (process.env.NODE_ENV === 'test') {
        console.error('[SquareWebhookService._attemptAutoConfirm] Error:', error.message, error.stack);
      }
      // In production, you might want to use a logger here
      // For now, we silently continue (auto-confirm is optional)
    }
  }

  /**
   * Mark ExternalEvent as PROCESSED.
   * @private
   */
  async _markProcessed(externalEventId) {
    await prisma.externalEvent.update({
      where: { id: externalEventId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });
  }

  /**
   * Mark ExternalEvent as FAILED with error message.
   * @private
   */
  async _markFailed(externalEventId, errorMessage) {
    await prisma.externalEvent.update({
      where: { id: externalEventId },
      data: {
        status: 'FAILED',
        processedAt: new Date(),
        errorMessage,
      },
    });
  }
}

export const squareWebhookService = new SquareWebhookService();
