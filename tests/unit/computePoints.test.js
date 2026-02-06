import { describe, it, expect } from '@jest/globals';
import { computePoints } from '../../src/services/earn/computePoints.js';

describe('computePoints', () => {
  it('should calculate points correctly for basic case', () => {
    const result = computePoints({
      amountCents: 2000, // $20.00
      pointsPerDollar: 10,
      minSubtotalCents: 0,
      rounding: 'FLOOR',
    });

    expect(result.points).toBe(200);
    expect(result.eligible).toBe(true);
  });

  it('should use FLOOR rounding correctly', () => {
    const result = computePoints({
      amountCents: 1999, // $19.99
      pointsPerDollar: 10,
      minSubtotalCents: 0,
      rounding: 'FLOOR',
    });

    // 19.99 * 10 = 199.9, floored = 199
    expect(result.points).toBe(199);
    expect(result.eligible).toBe(true);
  });

  it('should return eligible:false when amount is below minimum', () => {
    const result = computePoints({
      amountCents: 500, // $5.00
      pointsPerDollar: 10,
      minSubtotalCents: 1000, // $10.00 minimum
      rounding: 'FLOOR',
    });

    expect(result.points).toBe(0);
    expect(result.eligible).toBe(false);
  });

  it('should return eligible:true when amount equals minimum', () => {
    const result = computePoints({
      amountCents: 1000, // $10.00
      pointsPerDollar: 10,
      minSubtotalCents: 1000, // $10.00 minimum
      rounding: 'FLOOR',
    });

    expect(result.points).toBe(100);
    expect(result.eligible).toBe(true);
  });

  it('should handle zero amount', () => {
    const result = computePoints({
      amountCents: 0,
      pointsPerDollar: 10,
      minSubtotalCents: 0,
      rounding: 'FLOOR',
    });

    expect(result.points).toBe(0);
    expect(result.eligible).toBe(true);
  });

  it('should handle zero amount with minimum requirement', () => {
    const result = computePoints({
      amountCents: 0,
      pointsPerDollar: 10,
      minSubtotalCents: 100,
      rounding: 'FLOOR',
    });

    expect(result.points).toBe(0);
    expect(result.eligible).toBe(false);
  });

  it('should handle fractional points with FLOOR rounding', () => {
    const result = computePoints({
      amountCents: 333, // $3.33
      pointsPerDollar: 3,
      minSubtotalCents: 0,
      rounding: 'FLOOR',
    });

    // 3.33 * 3 = 9.99, floored = 9
    expect(result.points).toBe(9);
    expect(result.eligible).toBe(true);
  });

  it('should handle high points per dollar', () => {
    const result = computePoints({
      amountCents: 100, // $1.00
      pointsPerDollar: 100,
      minSubtotalCents: 0,
      rounding: 'FLOOR',
    });

    expect(result.points).toBe(100);
    expect(result.eligible).toBe(true);
  });

  it('should default to FLOOR for unknown rounding policy', () => {
    const result = computePoints({
      amountCents: 2000,
      pointsPerDollar: 10,
      minSubtotalCents: 0,
      rounding: 'UNKNOWN',
    });

    expect(result.points).toBe(200);
    expect(result.eligible).toBe(true);
  });
});
