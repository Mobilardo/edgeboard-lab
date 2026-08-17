import type { BoardSpec, PanelPlan, PatternGrid, ProductionPlan, ShopLimits, StripRun } from './types';

export function calculateKerfLoss(cutCount: number, sawKerf: number): number {
  return Math.max(0, cutCount) * Math.max(0, sawKerf);
}

function compressStrips(row: number[], widths: number[]): StripRun[] {
  return row.reduce<StripRun[]>((runs, species, index) => {
    const previous = runs[runs.length - 1];
    const width = widths[index];
    if (previous?.species === species && Math.abs(previous.width - width) < 0.001) previous.count += 1;
    else runs.push({ species, width, count: 1 });
    return runs;
  }, []);
}

export function compileProduction(
  grid: PatternGrid,
  spec: BoardSpec,
  limits: ShopLimits,
): ProductionPlan {
  const signatures = new Map<string, PanelPlan>();
  grid.cells.forEach((row) => {
    const key = row.join(',');
    const existing = signatures.get(key);
    if (existing) existing.repeats += 1;
    else {
      const strips = compressStrips(row, grid.columnWidths);
      signatures.set(key, {
        id: signatures.size + 1,
        repeats: 1,
        width: grid.columnWidths.reduce((sum, value) => sum + value, 0),
        strips,
      });
    }
  });
  const panels = [...signatures.values()];
  const sliceCount = grid.cells.length;
  const ripCuts = panels.reduce((sum, panel) => sum + Math.max(0, panel.strips.reduce((n, run) => n + run.count, 0) - 1), 0);
  const crossCuts = sliceCount + 1;
  const cutCount = ripCuts + crossCuts;
  const kerfLoss = calculateKerfLoss(cutCount, limits.sawKerf);
  const rowStock = spec.length + calculateKerfLoss(crossCuts, limits.sawKerf);
  const stockLengthNeeded = panels.reduce((sum, panel) => sum + rowStock * panel.repeats, 0);
  return {
    panels,
    sliceCount,
    cutCount,
    kerfLoss,
    stockLengthNeeded,
    flipMap: grid.cells.map((_, index) => index % 2 === 1),
    offsetMap: grid.cells.map((_, index) => index % 3),
    glueUps: panels.length + 1,
  };
}
