import type { BoardSpec, PatternGrid, ProductionPlan, RiskReport, RiskWarning, ShopLimits, Species } from './types';

export function calculateRisk(
  grid: PatternGrid,
  production: ProductionPlan,
  spec: BoardSpec,
  limits: ShopLimits,
  species: Species[],
): RiskReport {
  const warnings: RiskWarning[] = [];
  const tinyPieceCount = grid.columnWidths.filter((width) => width < limits.minStripWidth * 1.25).length * grid.cells.length;
  const tinyPenalty = Math.min(28, tinyPieceCount * 1.5);
  const complexityPenalty = Math.min(24, production.cutCount * 0.65 + production.glueUps * 1.5);
  const clampRatio = spec.width / limits.maxClampWidth;
  const clampPenalty = clampRatio > 1 ? 32 : clampRatio > 0.9 ? 12 : 0;
  const machinePenalty = spec.width > limits.machineWidth ? 18 : 0;
  const movementRange = Math.max(...species.map((item) => item.movement)) - Math.min(...species.map((item) => item.movement));
  const movementPenalty = movementRange > 0.35 ? 12 : movementRange > 0.2 ? 6 : 0;

  if (tinyPieceCount) warnings.push({ severity: 'caution', code: 'thin', title: 'Thin strip margin', detail: `${tinyPieceCount} cells are close to the safe strip limit.`, fix: 'Lower complexity or increase the minimum strip width.' });
  if (clampRatio > 1) warnings.push({ severity: 'critical', code: 'clamp', title: 'Clamp capacity exceeded', detail: `Panel is ${Math.round((clampRatio - 1) * 100)}% wider than clamp capacity.`, fix: 'Reduce board width or glue in sub-panels.' });
  else if (clampRatio > 0.9) warnings.push({ severity: 'caution', code: 'clamp-margin', title: 'Narrow clamp margin', detail: 'The glue-up uses more than 90% of clamp capacity.', fix: 'Leave extra clamp travel or reduce width.' });
  if (spec.width > limits.machineWidth) warnings.push({ severity: 'critical', code: 'machine', title: 'Surfacing limit exceeded', detail: 'The final width exceeds the entered planer or sander capacity.', fix: 'Use a router sled or reduce board width.' });
  if (movementRange > 0.2) warnings.push({ severity: 'caution', code: 'movement', title: 'Species movement mismatch', detail: 'Selected species have different movement ratings.', fix: 'Confirm moisture equilibrium and grain compatibility.' });
  if (production.glueUps > 5) warnings.push({ severity: 'notice', code: 'glue-ups', title: 'Multi-stage glue-up', detail: `${production.glueUps} glue-ups require careful sequencing.`, fix: 'Label assemblies and rehearse each dry fit.' });
  if (!warnings.length) warnings.push({ severity: 'notice', code: 'clear', title: 'Healthy build margins', detail: 'No modeled limit is close to failure.', fix: 'Confirm measurements before milling.' });

  const score = Math.round(Math.min(100, 7 + tinyPenalty + complexityPenalty + clampPenalty + machinePenalty + movementPenalty));
  return { score, level: score < 35 ? 'low' : score < 65 ? 'moderate' : 'high', warnings, tinyPieceCount };
}
