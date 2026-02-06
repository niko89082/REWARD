/**
 * Compute points earned from a payment amount based on reward program configuration.
 * 
 * @param {Object} params
 * @param {number} params.amountCents - Payment amount in cents
 * @param {number} params.pointsPerDollar - Points earned per dollar spent
 * @param {number} params.minSubtotalCents - Minimum subtotal in cents to earn points
 * @param {string} params.rounding - Rounding policy (currently only 'FLOOR' supported)
 * @returns {{ points: number, eligible: boolean }} Result with points and eligibility
 */
export function computePoints({ amountCents, pointsPerDollar, minSubtotalCents, rounding }) {
  // Check minimum subtotal requirement
  if (amountCents < minSubtotalCents) {
    return {
      points: 0,
      eligible: false,
    };
  }

  // Calculate points based on rounding policy
  if (rounding === 'FLOOR') {
    const points = Math.floor((amountCents / 100) * pointsPerDollar);
    return {
      points,
      eligible: true,
    };
  }

  // Default to FLOOR if unknown rounding policy
  const points = Math.floor((amountCents / 100) * pointsPerDollar);
  return {
    points,
    eligible: true,
  };
}
