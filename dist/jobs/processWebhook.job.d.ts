interface WebhookJobData {
    webhookLogId: string;
    payload: any;
}
/**
 * Process webhook job worker
 */
export declare function startWebhookWorker(): import("bullmq").Worker<WebhookJobData, any, string>;
export {};
//# sourceMappingURL=processWebhook.job.d.ts.map