import { describe, expect, it } from 'vitest';
import { createBoardPlan, createRng, createSaferPlan } from './core';

const spec = { length: 460, width: 310, thickness: 42 };
const limits = { sawKerf: 3.2, maxClampWidth: 380, stockLength: 1000, minStripWidth: 28, machineWidth: 330 };
const options = { seed: 'public-entry', family: 'woven-bands' as const, complexity: 5, riskTolerance: 'balanced' as const, speciesCount: 3 };

describe('public core entry', () => {
  it('keeps seeded random sequences deterministic', () => {
    const left = createRng('42');
    const right = createRng('42');
    expect([left(), left(), left()]).toEqual([right(), right(), right()]);
  });

  it('creates a reproducible board plan', () => {
    expect(createBoardPlan(spec, limits, options)).toEqual(createBoardPlan(spec, limits, options));
  });

  it('creates a lower-risk safe revision', () => {
    const risky = createBoardPlan(spec, { ...limits, maxClampWidth: 250 }, { ...options, complexity: 8, speciesCount: 4 });
    expect(createSaferPlan(risky).risk.score).toBeLessThan(risky.risk.score);
  });
});
