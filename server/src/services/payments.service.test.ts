import { describe, expect, it } from 'vitest';
import { planWaterfall, round2 } from './payments.service.js';

describe('round2', () => {
  it('rounds to cents', () => {
    expect(round2(99.999)).toBe(100);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(33.335)).toBe(33.34);
  });
});

describe('planWaterfall', () => {
  it('covers charges exactly with no surplus', () => {
    expect(planWaterfall([100, 50], 150)).toEqual({ applied: [100, 50], surplus: 0 });
  });

  it('fills oldest-first and leaves the tail partial on shortfall', () => {
    expect(planWaterfall([100, 100], 130)).toEqual({ applied: [100, 30], surplus: 0 });
    expect(planWaterfall([100, 100], 40)).toEqual({ applied: [40, 0], surplus: 0 });
  });

  it('returns the surplus after all charges are covered', () => {
    expect(planWaterfall([100], 120)).toEqual({ applied: [100], surplus: 20 });
    expect(planWaterfall([], 75)).toEqual({ applied: [], surplus: 75 });
  });

  it('tops up a partially covered charge (remaining, not amount)', () => {
    // charge of 100 with 60 already paid → remaining 40
    expect(planWaterfall([40, 100], 100)).toEqual({ applied: [40, 60], surplus: 0 });
  });

  it('stays exact through float-hostile splits', () => {
    // 3 × 33.33 vs a 100 charge: applied slices must never overshoot and the
    // running remainder must stay a clean 2-decimal number.
    let remaining = 100;
    for (let i = 0; i < 3; i++) {
      const { applied, surplus } = planWaterfall([remaining], 33.33);
      expect(surplus).toBe(0);
      remaining = round2(remaining - applied[0]!);
    }
    expect(remaining).toBe(0.01);
  });

  it('ignores negative remainings (over-covered rows)', () => {
    expect(planWaterfall([-5, 50], 50)).toEqual({ applied: [0, 50], surplus: 0 });
  });
});
