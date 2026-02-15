import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index';
import { ensureMerchantAuth, uniqueEmail } from '../helpers';

describe('Merchant Rewards', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let merchantToken: string;
  let merchantId: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/merchant/rewards creates reward', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/merchant/rewards',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        name: 'Free Coffee',
        description: '100 points for a free coffee',
        type: 'POINTS_BASED',
        pointsCost: 100,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.reward).toBeDefined();
    expect(body.reward.id).toBeDefined();
    expect(body.reward.name).toBe('Free Coffee');
    expect(body.reward.type).toBe('POINTS_BASED');
    expect(body.reward.pointsCost).toBe(100);
  });

  it('GET /api/merchant/rewards lists rewards', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/merchant/rewards',
      headers: { authorization: `Bearer ${merchantToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.rewards).toBeDefined();
    expect(Array.isArray(body.rewards)).toBe(true);
  });

  it('PUT /api/merchant/rewards/:id updates reward', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/merchant/rewards',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        name: 'Original Reward',
        type: 'POINTS_BASED',
        pointsCost: 50,
      },
    });
    const rewardId = JSON.parse(createRes.body).reward.id;

    const res = await app.inject({
      method: 'PUT',
      url: `/api/merchant/rewards/${rewardId}`,
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { name: 'Updated Reward', pointsCost: 75 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reward.name).toBe('Updated Reward');
    expect(body.reward.pointsCost).toBe(75);
  });

  it('POST /api/merchant/rewards requires auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/merchant/rewards',
      payload: {
        name: 'Free Coffee',
        type: 'POINTS_BASED',
        pointsCost: 100,
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
