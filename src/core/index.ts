import { compileProduction } from './compile';
import { estimateMaterials } from './materials';
import { generatePattern } from './patterns';
import { calculateRisk } from './risk';
import type { BoardPlan, BoardSpec, GeneratorOptions, ShopLimits, Species } from './types';

export const defaultSpecies: Species[] = [
  { id: 'maple', name: 'Твёрдый клён', color: '#d9bd83', costPerLiter: 4.8, movement: 0.42 },
  { id: 'walnut', name: 'Чёрный орех', color: '#5b3a2a', costPerLiter: 7.2, movement: 0.3 },
  { id: 'cherry', name: 'Вишня', color: '#a95f3f', costPerLiter: 5.9, movement: 0.36 },
  { id: 'ash', name: 'Ясень', color: '#cda96b', costPerLiter: 4.2, movement: 0.48 },
];

export function createBoardPlan(
  spec: BoardSpec,
  limits: ShopLimits,
  options: GeneratorOptions,
  catalog: Species[] = defaultSpecies,
): BoardPlan {
  const species = catalog.slice(0, Math.max(2, Math.min(options.speciesCount, catalog.length)));
  const grid = generatePattern(spec, limits, options);
  const production = compileProduction(grid, spec, limits);
  const risk = calculateRisk(grid, production, spec, limits, species);
  const materials = estimateMaterials(spec, grid, production, species);
  return { spec, limits, species, family: options.family, seed: options.seed, complexity: options.complexity, grid, production, risk, materials };
}

export function createSaferPlan(plan: BoardPlan): BoardPlan {
  const options: GeneratorOptions = {
    seed: `${plan.seed}-safe`,
    family: plan.family,
    complexity: Math.max(1, plan.complexity - 3),
    riskTolerance: 'low',
    speciesCount: Math.min(2, plan.species.length),
  };
  const saferLimits = { ...plan.limits, minStripWidth: Math.max(plan.limits.minStripWidth, plan.spec.width / 7) };
  return createBoardPlan(plan.spec, saferLimits, options, plan.species);
}

export * from './types';
export * from './compile';
export * from './patterns';
export * from './risk';
export * from './materials';
export * from './rng';
