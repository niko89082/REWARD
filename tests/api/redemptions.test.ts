import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index';
import { prisma } from '../../src/lib/prisma';
import { ensureMerchantAuth, uniqueEmail, uniquePhone } from '../helpers';

describe('Redemptions', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let merchantToken: string;
  let merchantId: string;
  let customerToken: string;
  let rewardId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    const auth = await ensureMerchantAuth(
      app,
      uniqueEmail(),
      'password123',
      'Test Merchant'
    );
    merchantToken = auth.merchantToken;
    merchantId = auth.merchantId;

    const rewardRes = await app.inject({
      method: 'POST',
      url: '/api/merchant/rewards',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        name: 'Free Coffee',
        type: 'POINTS_BASED',
        pointsCost: 100,
      },
    });
    rewardId = JSON.parse(rewardRes.body).reward.id;

    const phoneNumber = uniquePhone();
    await app.inject({
      method: 'POST',
      url: '/api/customer/auth/signup',
      payload: { phoneNumber },
    });
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/customer/auth/verify',
      payload: { phoneNumber, code: '123456' },
    });
    customerToken = JSON.parse(verifyRes.body).token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/customer/redemptions fails without sufficient balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/customer/redemptions',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { merchantId, rewardId },
    });
    expect([400, 500]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(body.error || body.message).toBeDefined();
  });

  it('POST /api/merchant/redemptions/verify requires valid code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/merchant/redemptions/verify',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { code: '000000' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('POST /api/customer/redemptions requires auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/customer/redemptions',
      payload: { merchantId, rewardId },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/customer/redemptions lists redemptions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/customer/redemptions',
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.redemptions).toBeDefined();
    expect(Array.isArray(body.redemptions)).toBe(true);
  });
});
