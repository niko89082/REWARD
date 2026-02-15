import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index';
import { ensureMerchantAuth, uniqueEmail, uniquePhone, setTestSmsCode } from '../helpers';

describe('Customer Auth', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/customer/auth/signup sends verification code', async () => {
    const phoneNumber = uniquePhone();
    const res = await app.inject({
      method: 'POST',
      url: '/api/customer/auth/signup',
      payload: { phoneNumber },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBeDefined();
    expect(body.customerId).toBeDefined();
  });

  it('POST /api/customer/auth/signup rejects invalid phone format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/customer/auth/signup',
      payload: { phoneNumber: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/customer/auth/verify returns token with valid code', async () => {
    const phoneNumber = uniquePhone();
    const testCode = '123456';
    await setTestSmsCode(phoneNumber, testCode);

    const res = await app.inject({
      method: 'POST',
      url: '/api/customer/auth/verify',
      payload: { phoneNumber, code: testCode },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.customer).toBeDefined();
    expect(body.customer.phoneNumber).toBe(phoneNumber);
  });

  it('POST /api/customer/auth/verify returns 401 with invalid code', async () => {
    const phoneNumber = uniquePhone();
    await setTestSmsCode(phoneNumber, '123456');

    const res = await app.inject({
      method: 'POST',
      url: '/api/customer/auth/verify',
      payload: { phoneNumber, code: '999999' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/customer/auth/me returns customer when authenticated', async () => {
    const phoneNumber = uniquePhone();
    const testCode = '654321';
    await setTestSmsCode(phoneNumber, testCode);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/customer/auth/verify',
      payload: { phoneNumber, code: testCode },
    });
    const token = JSON.parse(verifyRes.body).token;

    const res = await app.inject({
      method: 'GET',
      url: '/api/customer/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.customer).toBeDefined();
    expect(body.customer.phoneNumber).toBe(phoneNumber);
  });
});
