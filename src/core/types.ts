export type PatternFamily =
  | 'rail-fence'
  | 'woven-bands'
  | 'offset-brick'
  | 'gradient-lanes'
  | 'framed-checker'
  | 'split-chevron'
  | 'barcode-stripe'
  | 'asymmetric-accent';

export type RiskTolerance = 'low' | 'balanced' | 'high';

export interface BoardSpec {
  length: number;
  width: number;
  thickness: number;
}

export interface ShopLimits {
  sawKerf: number;
  maxClampWidth: number;
  stockLength: number;
  minStripWidth: number;
  machineWidth: number;
}

export interface Species {
  id: string;
  name: string;
  color: string;
  costPerLiter: number;
  movement: number;
}

export interface PatternGrid {
  cells: number[][];
  rowHeights: number[];
  columnWidths: number[];
}

export interface StripRun {
  species: number;
  width: number;
  count: number;
}

export interface PanelPlan {
  id: number;
  repeats: number;
  width: number;
  strips: StripRun[];
}

export interface ProductionPlan {
  panels: PanelPlan[];
  sliceCount: number;
  cutCount: number;
  kerfLoss: number;
  stockLengthNeeded: number;
  flipMap: boolean[];
  offsetMap: number[];
  glueUps: number;
}

export interface RiskWarning {
  severity: 'notice' | 'caution' | 'critical';
  code: string;
  title: string;
  detail: string;
  fix: string;
}

export interface RiskReport {
  score: number;
  level: 'low' | 'moderate' | 'high';
  warnings: RiskWarning[];
  tinyPieceCount: number;
}

export interface MaterialLine {
  species: number;
  volumeLiters: number;
  stockLength: number;
  estimatedCost: number;
}

export interface MaterialEstimate {
  lines: MaterialLine[];
  finalVolumeLiters: number;
  purchaseVolumeLiters: number;
  wastePercent: number;
  totalCost: number;
}

export interface GeneratorOptions {
  seed: string;
  family: PatternFamily;
  complexity: number;
  riskTolerance: RiskTolerance;
  speciesCount: number;
}

export interface BoardPlan {
  spec: BoardSpec;
  limits: ShopLimits;
  species: Species[];
  family: PatternFamily;
  seed: string;
  complexity: number;
  grid: PatternGrid;
  production: ProductionPlan;
  risk: RiskReport;
  materials: MaterialEstimate;
}
