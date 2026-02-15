import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index';
import { prisma } from '../../src/lib/prisma';
import { POSProvider } from '@prisma/client';
import { ensureMerchantAuth, uniqueEmail } from '../helpers';

const PROVIDER_MERCHANT_ID = 'a30f3483-4f5e-45fd-a15a-349b0ff5a5cd';

describe('Square Webhooks', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let testProviderMerchantId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    const integration = await prisma.pOSIntegration.findFirst({
      where: { provider: POSProvider.SQUARE },
    });
    testProviderMerchantId = integration?.providerMerchantId ?? PROVIDER_MERCHANT_ID;
  });

  afterAll(async () => {
    await app.close();
  });

  const createWebhookPayload = (overrides: Record<string, unknown> = {}) => {
    const payId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return {
      merchant_id: testProviderMerchantId,
      type: 'payment.created',
      event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      created_at: new Date().toISOString(),
      data: {
        type: 'payment',
        id: payId,
        object: {
          id: payId,
          merchant_id: testProviderMerchantId,
          amount_money: { amount: 1000, currency: 'USD' },
          location_id: 'loc_test',
          tenders: [
            {
              card_details: {
                card: {
                  last_4: '4242',
                  card_brand: 'VISA',
                  postal_code: '12345',
                },
              },
            },
          ],
        },
      },
      ...overrides,
    };
  };

  it('POST /webhooks/square returns 200 and received:true', async () => {
    const payload = createWebhookPayload();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/square',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.received).toBe(true);
  });

  it('POST /webhooks/square creates WebhookLog', async () => {
    const payload = createWebhookPayload();
    await app.inject({
      method: 'POST',
      url: '/webhooks/square',
      payload,
    });

    const log = await prisma.webhookLog.findFirst({
      where: {
        provider: POSProvider.SQUARE,
        eventType: payload.type,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeDefined();
    expect(log?.status).toBe('PENDING');
    expect(log?.payload).toBeDefined();
  });

  it('POST /webhooks/square is idempotent (returns 200 for duplicate event_ids)', async () => {
    const payload = createWebhookPayload();
    const res1 = await app.inject({
      method: 'POST',
      url: '/webhooks/square',
      payload,
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/webhooks/square',
      payload,
    });
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
  });
});
