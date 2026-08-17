import type { BoardSpec, MaterialEstimate, PatternGrid, ProductionPlan, Species } from './types';

export function estimateMaterials(
  spec: BoardSpec,
  grid: PatternGrid,
  production: ProductionPlan,
  species: Species[],
): MaterialEstimate {
  const finalVolumeLiters = (spec.length * spec.width * spec.thickness) / 1_000_000;
  const kerfVolume = (production.kerfLoss * spec.width * spec.thickness) / 1_000_000;
  const purchaseVolumeLiters = finalVolumeLiters + kerfVolume;
  const counts = species.map((_, index) => grid.cells.flat().filter((cell) => cell === index).length);
  const total = counts.reduce((sum, count) => sum + count, 0) || 1;
  const lines = species.map((item, index) => {
    const share = counts[index] / total;
    const volumeLiters = purchaseVolumeLiters * share;
    return {
      species: index,
      volumeLiters,
      stockLength: production.stockLengthNeeded * share,
      estimatedCost: volumeLiters * item.costPerLiter,
    };
  }).filter((line) => line.volumeLiters > 0);
  return {
    lines,
    finalVolumeLiters,
    purchaseVolumeLiters,
    wastePercent: finalVolumeLiters ? ((purchaseVolumeLiters / finalVolumeLiters) - 1) * 100 : 0,
    totalCost: lines.reduce((sum, line) => sum + line.estimatedCost, 0),
  };
}
