import { describe, expect, it } from 'vitest';
import { calculateKerfLoss, calculateRisk, compileProduction, createBoardPlan, createRng, createSaferPlan, defaultSpecies, estimateMaterials, generatePattern, gridDimensions, hashSeed, randomInt, seededShuffle } from '.';
import type { BoardSpec, GeneratorOptions, PatternFamily, ShopLimits } from '.';

const spec: BoardSpec = { length: 450, width: 300, thickness: 40 };
const limits: ShopLimits = { sawKerf: 3, maxClampWidth: 360, stockLength: 1000, minStripWidth: 25, machineWidth: 320 };
const options: GeneratorOptions = { seed: 'test-seed', family: 'rail-fence', complexity: 5, riskTolerance: 'balanced', speciesCount: 3 };
const families: PatternFamily[] = ['rail-fence', 'woven-bands', 'offset-brick', 'gradient-lanes', 'framed-checker', 'split-chevron', 'barcode-stripe', 'asymmetric-accent'];

describe('deterministic random utilities', () => {
  it('hashes the same seed identically', () => expect(hashSeed('oak')).toBe(hashSeed('oak')));
  it('distinguishes seed strings', () => expect(hashSeed('oak')).not.toBe(hashSeed('ash')));
  it('creates reproducible sequences', () => {
    const a = createRng('repeat'); const b = createRng('repeat');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('keeps generated values in [0, 1)', () => {
    const rng = createRng('bounds');
    expect(Array.from({ length: 100 }, rng).every((value) => value >= 0 && value < 1)).toBe(true);
  });
  it('creates bounded integers', () => {
    const rng = createRng('integer');
    expect(Array.from({ length: 30 }, () => randomInt(rng, 3, 6)).every((value) => value >= 3 && value <= 6)).toBe(true);
  });
  it('shuffles deterministically without losing values', () => {
    const result = seededShuffle([1, 2, 3, 4, 5], createRng('shuffle'));
    expect(result).toEqual(seededShuffle([1, 2, 3, 4, 5], createRng('shuffle')));
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('pattern families', () => {
  it.each(families)('%s preserves required dimensions', (family) => {
    const grid = generatePattern(spec, limits, { ...options, family });
    expect(grid.cells.length).toBe(grid.rowHeights.length);
    expect(grid.cells.every((row) => row.length === grid.columnWidths.length)).toBe(true);
    expect(grid.rowHeights.reduce((a, b) => a + b, 0)).toBeCloseTo(spec.length);
    expect(grid.columnWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(spec.width);
  });
  it('respects the safe strip width when sizing the grid', () => {
    const dimensions = gridDimensions({ ...spec, width: 180 }, { ...limits, minStripWidth: 60 }, 10);
    expect(dimensions.columns).toBe(3);
  });
  it('increases module count with available complexity', () => {
    expect(gridDimensions(spec, limits, 9).columns).toBeGreaterThan(gridDimensions(spec, limits, 1).columns);
  });
  it('uses only the requested species range', () => {
    const grid = generatePattern(spec, limits, { ...options, speciesCount: 2, family: 'barcode-stripe' });
    expect(Math.max(...grid.cells.flat())).toBeLessThan(2);
  });
  it('changes stochastic patterns with the seed', () => {
    const a = generatePattern(spec, limits, { ...options, family: 'barcode-stripe', seed: 'a' });
    const b = generatePattern(spec, limits, { ...options, family: 'barcode-stripe', seed: 'b' });
    expect(a.cells).not.toEqual(b.cells);
  });
});

describe('manufacturing compiler', () => {
  const grid = generatePattern(spec, limits, options);
  it('uses cut count times blade kerf', () => expect(calculateKerfLoss(12, 3.2)).toBeCloseTo(38.4));
  it('does not return negative kerf loss', () => expect(calculateKerfLoss(-2, 3)).toBe(0));
  it('counts one slice per row', () => expect(compileProduction(grid, spec, limits).sliceCount).toBe(grid.cells.length));
  it('compresses identical panel signatures', () => {
    const repeated = { ...grid, cells: [grid.cells[0], grid.cells[0]] };
    expect(compileProduction(repeated, spec, limits).panels).toHaveLength(1);
  });
  it('creates an alternating flip map', () => expect(compileProduction(grid, spec, limits).flipMap.slice(0, 4)).toEqual([false, true, false, true]));
  it('stock requirement grows with board length', () => {
    const shortPlan = createBoardPlan({ ...spec, length: 300 }, limits, options);
    const longPlan = createBoardPlan({ ...spec, length: 600 }, limits, options);
    expect(longPlan.production.stockLengthNeeded).toBeGreaterThan(shortPlan.production.stockLengthNeeded);
  });
  it('kerf loss grows with a wider blade', () => {
    const narrow = compileProduction(grid, spec, { ...limits, sawKerf: 2 });
    const wide = compileProduction(grid, spec, { ...limits, sawKerf: 5 });
    expect(wide.kerfLoss).toBeGreaterThan(narrow.kerfLoss);
  });
});

describe('risk and materials', () => {
  it('risk rises with tiny strips and complexity', () => {
    const simple = createBoardPlan(spec, limits, { ...options, complexity: 1 });
    const complex = createBoardPlan(spec, { ...limits, minStripWidth: 55 }, { ...options, complexity: 10 });
    expect(complex.risk.score).toBeGreaterThan(simple.risk.score);
  });
  it('flags boards beyond clamp capacity', () => {
    const plan = createBoardPlan(spec, { ...limits, maxClampWidth: 250 }, options);
    expect(plan.risk.warnings.some((warning) => warning.code === 'clamp')).toBe(true);
  });
  it('flags boards beyond machine capacity', () => {
    const plan = createBoardPlan(spec, { ...limits, machineWidth: 250 }, options);
    expect(plan.risk.warnings.some((warning) => warning.code === 'machine')).toBe(true);
  });
  it('keeps risk score within 0–100', () => {
    const plan = createBoardPlan({ ...spec, width: 900 }, { ...limits, maxClampWidth: 100, machineWidth: 100 }, { ...options, complexity: 10 });
    expect(plan.risk.score).toBeGreaterThanOrEqual(0); expect(plan.risk.score).toBeLessThanOrEqual(100);
  });
  it('make safer reduces modeled risk', () => {
    const risky = createBoardPlan(spec, limits, { ...options, complexity: 10 });
    expect(createSaferPlan(risky).risk.score).toBeLessThan(risky.risk.score);
  });
  it('final volume follows board dimensions', () => {
    const plan = createBoardPlan(spec, limits, options);
    expect(plan.materials.finalVolumeLiters).toBeCloseTo(5.4);
  });
  it('material purchase requirement grows with board size', () => {
    const small = createBoardPlan(spec, limits, options);
    const large = createBoardPlan({ ...spec, length: spec.length * 2 }, limits, options);
    expect(large.materials.purchaseVolumeLiters).toBeGreaterThan(small.materials.purchaseVolumeLiters);
  });
  it('material lines reconcile to purchase volume', () => {
    const plan = createBoardPlan(spec, limits, options);
    expect(plan.materials.lines.reduce((sum, line) => sum + line.volumeLiters, 0)).toBeCloseTo(plan.materials.purchaseVolumeLiters);
  });
  it('reports movement mismatch for divergent species', () => {
    const grid = generatePattern(spec, limits, options); const production = compileProduction(grid, spec, limits);
    const risk = calculateRisk(grid, production, spec, limits, [{ ...defaultSpecies[0], movement: 0.1 }, { ...defaultSpecies[1], movement: 0.8 }]);
    expect(risk.warnings.some((warning) => warning.code === 'movement')).toBe(true);
  });
  it('estimates positive cost', () => {
    const grid = generatePattern(spec, limits, options); const production = compileProduction(grid, spec, limits);
    expect(estimateMaterials(spec, grid, production, defaultSpecies.slice(0, 3)).totalCost).toBeGreaterThan(0);
  });
});
