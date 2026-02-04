import { z } from 'zod';

const freeItemSchema = z.object({
  version: z.literal(1),
  displayName: z.string().min(1),
  squareCatalogObjectId: z.string().min(1),
  squareDiscountName: z.string().min(1),
});

const percentOffSchema = z.object({
  version: z.literal(1),
  displayName: z.string().min(1),
  percentOff: z.number().int().min(1).max(100),
  appliesTo: z.literal('ORDER_SUBTOTAL'),
  squareDiscountName: z.string().min(1),
});

const amountOffSchema = z.object({
  version: z.literal(1),
  displayName: z.string().min(1),
  amountOffCents: z.number().int().positive(),
  appliesTo: z.literal('ORDER_SUBTOTAL'),
  squareDiscountName: z.string().min(1),
});

export const validateConfigJson = (rewardType, data) => {
  if (rewardType === 'FREE_ITEM') {
    return freeItemSchema.parse(data);
  } else if (rewardType === 'PERCENT_OFF') {
    return percentOffSchema.parse(data);
  } else if (rewardType === 'AMOUNT_OFF') {
    return amountOffSchema.parse(data);
  } else {
    throw new Error(`Unknown rewardType: ${rewardType}`);
  }
};

export { freeItemSchema, percentOffSchema, amountOffSchema };
