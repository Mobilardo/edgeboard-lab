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

  if (tinyPieceCount) warnings.push({ severity: 'caution', code: 'thin', title: 'Мало запаса по тонким рейкам', detail: `${tinyPieceCount} ячеек близко к безопасной ширине рейки.`, fix: 'Снизить сложность или увеличить минимальную ширину рейки.' });
  if (clampRatio > 1) warnings.push({ severity: 'critical', code: 'clamp', title: 'Не хватает ширины струбцин', detail: `Панель на ${Math.round((clampRatio - 1) * 100)}% шире указанного предела струбцин.`, fix: 'Уменьшить ширину доски или клеить подпанелями.' });
  else if (clampRatio > 0.9) warnings.push({ severity: 'caution', code: 'clamp-margin', title: 'Малый запас струбцин', detail: 'Склейка использует больше 90% доступной ширины струбцин.', fix: 'Оставить запас хода струбцин или уменьшить ширину.' });
  if (spec.width > limits.machineWidth) warnings.push({ severity: 'critical', code: 'machine', title: 'Доска шире станка', detail: 'Финальная ширина больше указанной ширины рейсмуса или шлифовки.', fix: 'Использовать фрезерные салазки или уменьшить ширину доски.' });
  if (movementRange > 0.2) warnings.push({ severity: 'caution', code: 'movement', title: 'Породы двигаются по-разному', detail: 'У выбранных пород заметно разные коэффициенты движения древесины.', fix: 'Проверить влажность и совместимость направления волокон.' });
  if (production.glueUps > 5) warnings.push({ severity: 'notice', code: 'glue-ups', title: 'Многоэтапная склейка', detail: `${production.glueUps} склеек требуют аккуратной последовательности.`, fix: 'Промаркировать сборки и отрепетировать сухую сборку.' });
  if (!warnings.length) warnings.push({ severity: 'notice', code: 'clear', title: 'Хороший запас изготовления', detail: 'Ни одно смоделированное ограничение не близко к провалу.', fix: 'Проверить размеры у станка перед распуском.' });

  const score = Math.round(Math.min(100, 7 + tinyPenalty + complexityPenalty + clampPenalty + machinePenalty + movementPenalty));
  return { score, level: score < 35 ? 'low' : score < 65 ? 'moderate' : 'high', warnings, tinyPieceCount };
}
