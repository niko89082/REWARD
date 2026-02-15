interface ReconciliationJobData {
    merchantId: string;
    posIntegrationId: string;
    startDate: Date;
    endDate: Date;
}
/**
 * Daily reconciliation job
 * Runs at 2am to reconcile transactions from previous day
 */
export declare function scheduleReconciliation(): Promise<void>;
/**
 * Process reconciliation job
 */
export declare function processReconciliation(data: ReconciliationJobData): Promise<void>;
/**
 * Start reconciliation worker
 */
export declare function startReconciliationWorker(): import("bullmq").Worker<ReconciliationJobData, any, string>;
export {};
//# sourceMappingURL=reconciliation.job.d.ts.map