import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index';
import { ensureMerchantAuth, uniqueEmail, uniquePhone } from '../helpers';

describe('Customer Cards & Balance', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let merchantToken: string;
  let merchantId: string;
  let customerToken: string;

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

  it('GET /api/customer/cards returns empty list for new customer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/customer/cards',
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.cards).toBeDefined();
    expect(Array.isArray(body.cards)).toBe(true);
  });

  it('GET /api/customer/balance/:merchantId returns 0 for new customer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/customer/balance/${merchantId}`,
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.balance).toBe(0);
  });

  it('GET /api/customer/cards requires auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/customer/cards',
    });
    expect(res.statusCode).toBe(401);
  });
});
