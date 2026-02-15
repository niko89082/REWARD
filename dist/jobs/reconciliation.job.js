import { Queue } from 'bullmq';
import { createQueue, createWorker } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { POSProvider } from '@prisma/client';
import { getPOSProvider } from '../pos/factory';
import { decrypt } from '../lib/crypto';
const reconciliationQueue = createQueue('reconciliation');
/**
 * Daily reconciliation job
 * Runs at 2am to reconcile transactions from previous day
 */
export async function scheduleReconciliation() {
    try {
        // Get yesterday's date range
        const endDate = new Date();
        endDate.setHours(0, 0, 0, 0); // Start of today
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 1); // Yesterday
        logger.info({ startDate, endDate }, 'Scheduling reconciliation jobs');
        // Get all active POS integrations
        const integrations = await prisma.pOSIntegration.findMany({
            where: {
                provider: POSProvider.SQUARE,
            },
            include: {
                merchant: true,
            },
        });
        // Queue reconciliation job for each integration
        for (const integration of integrations) {
            await reconciliationQueue.add('reconcile-transactions', {
                merchantId: integration.merchantId,
                posIntegrationId: integration.id,
                startDate,
                endDate,
            }, {
                jobId: `reconcile-${integration.id}-${startDate.toISOString()}`,
            });
        }
        logger.info({ count: integrations.length }, 'Reconciliation jobs queued');
    }
    catch (error) {
        logger.error({ error }, 'Failed to schedule reconciliation');
        throw error;
    }
}
/**
 * Process reconciliation job
 */
export async function processReconciliation(data) {
    const { merchantId, posIntegrationId, startDate, endDate } = data;
    try {
        logger.info({ merchantId, posIntegrationId, startDate, endDate }, 'Processing reconciliation');
        const integration = await prisma.pOSIntegration.findUnique({
            where: { id: posIntegrationId },
        });
        if (!integration) {
            throw new Error('POS integration not found');
        }
        if (integration.merchantId !== merchantId) {
            throw new Error('POS integration does not belong to merchant');
        }
        // Decrypt access token
        const decryptedAccessToken = decrypt(integration.accessToken);
        // Get provider and fetch transactions
        const provider = getPOSProvider(integration.provider);
        const transactions = await provider.fetchTransactions(decryptedAccessToken, undefined, startDate, endDate);
        // Get all locations for this integration
        const locations = await prisma.location.findMany({
            where: {
                posIntegrationId,
            },
        });
        const locationMap = new Map(locations.map((loc) => [loc.posLocationId, loc.id]));
        // Check each transaction exists in database
        let created = 0;
        let missing = 0;
        for (const transaction of transactions) {
            const existing = await prisma.transaction.findUnique({
                where: {
                    posProvider_posTransactionId: {
                        posProvider: integration.provider,
                        posTransactionId: transaction.id,
                    },
                },
            });
            if (!existing) {
                missing++;
                logger.warn({
                    posTransactionId: transaction.id,
                    merchantId,
                    amount: transaction.amount,
                }, 'Missing transaction found during reconciliation');
                // Optionally create missing transaction
                // For now, we just log it
                // In production, you might want to create it or alert
            }
            else {
                created++;
            }
        }
        logger.info({
            merchantId,
            posIntegrationId,
            total: transactions.length,
            existing: created,
            missing,
        }, 'Reconciliation completed');
        // Alert if there are discrepancies
        if (missing > 0) {
            logger.warn({
                merchantId,
                posIntegrationId,
                missing,
            }, 'Reconciliation found missing transactions');
        }
    }
    catch (error) {
        logger.error({ error, merchantId, posIntegrationId }, 'Reconciliation failed');
        throw error;
    }
}
/**
 * Start reconciliation worker
 */
export function startReconciliationWorker() {
    const worker = createWorker('reconciliation', async (job) => {
        await processReconciliation(job.data);
    });
    logger.info('Reconciliation worker started');
    return worker;
}
//# sourceMappingURL=reconciliation.job.js.map