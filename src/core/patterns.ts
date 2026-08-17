import { createRng, randomInt } from './rng';
import type { BoardSpec, GeneratorOptions, PatternGrid, ShopLimits } from './types';

const distribute = (total: number, count: number): number[] => {
  const base = total / count;
  return Array.from({ length: count }, () => base);
};

export function gridDimensions(spec: BoardSpec, limits: ShopLimits, complexity: number) {
  const desired = 3 + Math.round(complexity * 0.7);
  const maxColumns = Math.max(2, Math.floor(spec.width / limits.minStripWidth));
  const maxRows = Math.max(2, Math.floor(spec.length / Math.max(limits.minStripWidth, spec.thickness)));
  return {
    columns: Math.min(desired + 1, maxColumns, 14),
    rows: Math.min(desired, maxRows, 12),
  };
}

export function generatePattern(
  spec: BoardSpec,
  limits: ShopLimits,
  options: GeneratorOptions,
): PatternGrid {
  const rng = createRng(`${options.seed}:${options.family}`);
  const { rows, columns } = gridDimensions(spec, limits, options.complexity);
  const count = Math.max(2, options.speciesCount);
  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      switch (options.family) {
        case 'rail-fence':
          return (column + Math.floor(row / 2)) % count;
        case 'woven-bands':
          return (Math.floor(row / 2) + Math.floor(column / 2) + (row % 2)) % count;
        case 'offset-brick':
          return (Math.floor((column + (row % 2 ? 1 : 0)) / 2) + row) % count;
        case 'gradient-lanes':
          return Math.min(count - 1, Math.floor((column / columns) * count));
        case 'framed-checker':
          return row === 0 || column === 0 || row === rows - 1 || column === columns - 1
            ? count - 1
            : (row + column) % Math.max(2, count - 1);
        case 'split-chevron': {
          const distance = Math.abs(column - (columns - 1) / 2);
          return (Math.floor(distance + row) + (column >= columns / 2 ? 1 : 0)) % count;
        }
        case 'barcode-stripe':
          return (column * column + randomInt(rng, 0, count - 1)) % count;
        case 'asymmetric-accent': {
          const accent = Math.max(1, Math.floor(columns * 0.68));
          return column === accent ? count - 1 : (column + row % 2) % Math.max(1, count - 1);
        }
      }
    }),
  );

  return {
    cells,
    rowHeights: distribute(spec.length, rows),
    columnWidths: distribute(spec.width, columns),
  };
}
