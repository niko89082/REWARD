import { describe, it, expect } from '@jest/globals';
import { validateEarnParamsJson } from '../../src/validators/rewardProgram.js';
import { validateConfigJson } from '../../src/validators/reward.js';

describe('RewardProgram validators', () => {
  it('should validate POINTS_PER_DOLLAR schema correctly', () => {
    const valid = {
      version: 1,
      pointsPerDollar: 10,
      rounding: 'FLOOR',
      minSubtotalCents: 0,
    };
    expect(() => validateEarnParamsJson('POINTS_PER_DOLLAR', valid)).not.toThrow();
  });

  it('should reject POINTS_PER_DOLLAR with invalid fields', () => {
    const invalid = {
      version: 1,
      pointsPerDollar: -5, // negative
      rounding: 'FLOOR',
      minSubtotalCents: 0,
    };
    expect(() => validateEarnParamsJson('POINTS_PER_DOLLAR', invalid)).toThrow();
  });

  it('should validate ITEM_POINTS schema correctly', () => {
    const valid = {
      version: 1,
      items: [
        { squareCatalogObjectId: 'ITEM_1', points: 50 },
      ],
    };
    expect(() => validateEarnParamsJson('ITEM_POINTS', valid)).not.toThrow();
  });

  it('should reject ITEM_POINTS with empty items array', () => {
    const invalid = {
      version: 1,
      items: [],
    };
    expect(() => validateEarnParamsJson('ITEM_POINTS', invalid)).toThrow();
  });
});

describe('Reward validators', () => {
  it('should validate FREE_ITEM schema correctly', () => {
    const valid = {
      version: 1,
      displayName: 'Free Coffee',
      squareCatalogObjectId: 'ITEM_1',
      squareDiscountName: 'Reward: Free Coffee',
    };
    expect(() => validateConfigJson('FREE_ITEM', valid)).not.toThrow();
  });

  it('should reject FREE_ITEM with missing required fields', () => {
    const invalid = {
      version: 1,
      displayName: 'Free Coffee',
      // missing squareCatalogObjectId
    };
    expect(() => validateConfigJson('FREE_ITEM', invalid)).toThrow();
  });

  it('should validate PERCENT_OFF schema correctly', () => {
    const valid = {
      version: 1,
      displayName: '20% Off',
      percentOff: 20,
      appliesTo: 'ORDER_SUBTOTAL',
      squareDiscountName: 'Reward: 20% Off',
    };
    expect(() => validateConfigJson('PERCENT_OFF', valid)).not.toThrow();
  });

  it('should reject PERCENT_OFF with invalid percentOff range', () => {
    const invalid = {
      version: 1,
      displayName: '20% Off',
      percentOff: 101, // > 100
      appliesTo: 'ORDER_SUBTOTAL',
      squareDiscountName: 'Reward: 20% Off',
    };
    expect(() => validateConfigJson('PERCENT_OFF', invalid)).toThrow();
  });

  it('should validate AMOUNT_OFF schema correctly', () => {
    const valid = {
      version: 1,
      displayName: '$5 Off',
      amountOffCents: 500,
      appliesTo: 'ORDER_SUBTOTAL',
      squareDiscountName: 'Reward: $5 Off',
    };
    expect(() => validateConfigJson('AMOUNT_OFF', valid)).not.toThrow();
  });

  it('should reject AMOUNT_OFF with zero amount', () => {
    const invalid = {
      version: 1,
      displayName: '$5 Off',
      amountOffCents: 0, // must be positive
      appliesTo: 'ORDER_SUBTOTAL',
      squareDiscountName: 'Reward: $5 Off',
    };
    expect(() => validateConfigJson('AMOUNT_OFF', invalid)).toThrow();
  });
});
