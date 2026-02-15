import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index';
import { ensureMerchantAuth, uniqueEmail } from '../helpers';

describe('Merchant Auth', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const password = 'password123';
  const name = 'Test Merchant';

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('signup creates merchant and returns token', async () => {
    const email = uniqueEmail();
    const res = await app.inject({
      method: 'POST',
      url: '/api/merchant/auth/signup',
      payload: { email, password, name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.merchant).toBeDefined();
    expect(body.merchant.id).toBeDefined();
    expect(body.merchant.email).toBe(email);
    expect(body.merchant.name).toBe(name);
  });

  it('signup with existing email returns 409', async () => {
    const email = uniqueEmail();
    await app.inject({
      method: 'POST',
      url: '/api/merchant/auth/signup',
      payload: { email, password, name },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/merchant/auth/signup',
      payload: { email, password, name },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('login returns token for existing merchant', async () => {
    const email = uniqueEmail();
    await app.inject({
      method: 'POST',
      url: '/api/merchant/auth/signup',
      payload: { email, password, name },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/merchant/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.merchant.email).toBe(email);
  });

  it('login with wrong password returns 401', async () => {
    const email = uniqueEmail();
    await app.inject({
      method: 'POST',
      url: '/api/merchant/auth/signup',
      payload: { email, password, name },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/merchant/auth/login',
      payload: { email, password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('ensureMerchantAuth handles already-existing account', async () => {
    const email = uniqueEmail();
    const first = await ensureMerchantAuth(app, email, password, name);
    expect(first.merchantToken).toBeDefined();
    expect(first.merchantId).toBeDefined();

    const second = await ensureMerchantAuth(app, email, password, name);
    expect(second.merchantToken).toBeDefined();
    expect(second.merchantId).toBe(first.merchantId);
  });

  it('GET /api/merchant/auth/me returns merchant when authenticated', async () => {
    const { merchantToken } = await ensureMerchantAuth(app, uniqueEmail(), password, name);
    const res = await app.inject({
      method: 'GET',
      url: '/api/merchant/auth/me',
      headers: { authorization: `Bearer ${merchantToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.merchant).toBeDefined();
    expect(body.merchant.id).toBeDefined();
    expect(body.merchant.email).toBeDefined();
  });

  it('GET /api/merchant/auth/me returns 401 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/merchant/auth/me',
    });
    expect(res.statusCode).toBe(401);
  });
});
