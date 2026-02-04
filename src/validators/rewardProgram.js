import { z } from 'zod';

const pointsPerDollarSchema = z.object({
  version: z.literal(1),
  pointsPerDollar: z.number().int().positive(),
  rounding: z.literal('FLOOR'),
  minSubtotalCents: z.number().int().nonnegative(),
});

const itemPointsSchema = z.object({
  version: z.literal(1),
  items: z.array(
    z.object({
      squareCatalogObjectId: z.string().min(1),
      points: z.number().int().positive(),
    })
  ).min(1),
});

export const validateEarnParamsJson = (earnType, data) => {
  if (earnType === 'POINTS_PER_DOLLAR') {
    return pointsPerDollarSchema.parse(data);
  } else if (earnType === 'ITEM_POINTS') {
    return itemPointsSchema.parse(data);
  } else {
    throw new Error(`Unknown earnType: ${earnType}`);
  }
};

export { pointsPerDollarSchema, itemPointsSchema };
