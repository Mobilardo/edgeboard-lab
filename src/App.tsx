import { useEffect, useMemo, useRef, useState } from 'react';
import { createBoardPlan, createSaferPlan, defaultSpecies } from './core/index';
import type { BoardPlan, BoardSpec, PatternFamily, RiskTolerance, ShopLimits } from './core/index';

const families: { value: PatternFamily; label: string; note: string }[] = [
  { value: 'rail-fence', label: 'Rail fence', note: 'Stable linear rhythm' },
  { value: 'woven-bands', label: 'Woven bands', note: 'Interlocked repeats' },
  { value: 'offset-brick', label: 'Offset brick', note: 'Staggered blocks' },
  { value: 'gradient-lanes', label: 'Gradient lanes', note: 'Calm tonal shift' },
  { value: 'framed-checker', label: 'Framed checker', note: 'Defined perimeter' },
  { value: 'split-chevron', label: 'Split chevron', note: 'Directional center' },
  { value: 'barcode-stripe', label: 'Barcode stripe', note: 'Irregular cadence' },
  { value: 'asymmetric-accent', label: 'Asymmetric accent', note: 'Off-axis marker' },
];

const initialSpec: BoardSpec = { length: 460, width: 310, thickness: 42 };
const initialLimits: ShopLimits = { sawKerf: 3.2, maxClampWidth: 380, stockLength: 1000, minStripWidth: 28, machineWidth: 330 };

const shopPresets: { label: string; spec: BoardSpec; limits: ShopLimits; family: PatternFamily; complexity: number; riskTolerance: RiskTolerance; speciesCount: number; seed: string; note: string }[] = [
  { label: 'Small shop safe', spec: { length: 360, width: 240, thickness: 38 }, limits: { sawKerf: 3.0, maxClampWidth: 280, stockLength: 800, minStripWidth: 32, machineWidth: 260 }, family: 'rail-fence', complexity: 4, riskTolerance: 'low', speciesCount: 3, seed: 'safe-shop', note: 'fewer thin parts, narrow clamp window' },
  { label: 'Showpiece board', spec: { length: 520, width: 340, thickness: 45 }, limits: { sawKerf: 3.2, maxClampWidth: 420, stockLength: 1200, minStripWidth: 24, machineWidth: 360 }, family: 'split-chevron', complexity: 7, riskTolerance: 'balanced', speciesCount: 4, seed: 'showpiece', note: 'strong center motion with realistic glue-ups' },
  { label: 'Fast weekend build', spec: { length: 420, width: 300, thickness: 40 }, limits: { sawKerf: 3.2, maxClampWidth: 360, stockLength: 1000, minStripWidth: 30, machineWidth: 330 }, family: 'offset-brick', complexity: 5, riskTolerance: 'balanced', speciesCount: 3, seed: 'weekend', note: 'simple repeat, clean ticket, low surprise factor' },
];

const familyName = (family: PatternFamily) => families.find((item) => item.value === family)?.label ?? family;
const format = (value: number, digits = 0) => value.toFixed(digits);

function NumberField({ label, value, min, max, step = 1, unit = 'mm', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><span className="input-shell"><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /><b>{unit}</b></span></label>;
}



function BoardModel3D({ plan }: { plan: BoardPlan }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<'webgl' | 'top' | 'slices'>('webgl');

  useEffect(() => {
    if (mode !== 'webgl' || !mountRef.current) return;
    let disposed = false;
    let cleanup = () => undefined;

    const createTexture = async () => {
      const THREE = await import('three');
      const canvas = document.createElement('canvas');
      const cellSize = 44;
      const rows = plan.grid.cells.length;
      const columns = plan.grid.cells[0]?.length ?? 1;
      canvas.width = columns * cellSize;
      canvas.height = rows * cellSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#1b2d32';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      plan.grid.cells.forEach((row, rowIndex) => row.forEach((species, columnIndex) => {
        const x = columnIndex * cellSize;
        const y = rowIndex * cellSize;
        ctx.fillStyle = plan.species[species]?.color ?? '#9b6a44';
        ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
        ctx.save();
        ctx.translate(x + cellSize / 2, y + cellSize / 2);
        ctx.rotate(((rowIndex + columnIndex) % 2 ? 28 : -18) * Math.PI / 180);
        ctx.strokeStyle = 'rgba(255,255,255,.28)';
        ctx.lineWidth = 1;
        for (let line = -cellSize; line < cellSize; line += 9) {
          ctx.beginPath();
          ctx.moveTo(-cellSize, line);
          ctx.lineTo(cellSize, line + 10);
          ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(0,0,0,.22)';
        ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      }));
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      return texture;
    };

    Promise.all([import('three'), import('three/examples/jsm/controls/OrbitControls.js'), createTexture()]).then(([THREE, controlsModule, texture]) => {
      if (disposed || !mountRef.current || !texture) return;
      const container = mountRef.current;
      const scene = new THREE.Scene();
      scene.background = null;
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(4.8, 3.2, 5.8);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.replaceChildren(renderer.domElement);

      const length = 4.8;
      const width = Math.max(2.2, Math.min(3.6, plan.spec.width / plan.spec.length * length));
      const thickness = Math.max(.32, Math.min(.72, plan.spec.thickness / 70));
      const woodSide = new THREE.MeshStandardMaterial({ color: '#835837', roughness: .74, metalness: .04 });
      const darkSide = new THREE.MeshStandardMaterial({ color: '#553725', roughness: .82, metalness: .02 });
      const face = new THREE.MeshStandardMaterial({ map: texture, roughness: .62, metalness: .03 });
      const board = new THREE.Mesh(new THREE.BoxGeometry(length, thickness, width, 18, 3, 12), [woodSide, darkSide, woodSide, darkSide, face, face]);
      board.rotation.y = -.35;
      scene.add(board);

      const bevel = new THREE.LineSegments(new THREE.EdgesGeometry(board.geometry), new THREE.LineBasicMaterial({ color: '#1b2d32', transparent: true, opacity: .45 }));
      board.add(bevel);

      const table = new THREE.Mesh(new THREE.CircleGeometry(4.8, 80), new THREE.MeshBasicMaterial({ color: '#0d171a', transparent: true, opacity: .28 }));
      table.rotation.x = -Math.PI / 2;
      table.position.y = -thickness / 2 - .12;
      scene.add(table);

      scene.add(new THREE.HemisphereLight('#fff8e8', '#183139', 2.2));
      const key = new THREE.DirectionalLight('#fff4d6', 3.4);
      key.position.set(3, 5, 4);
      scene.add(key);
      const rim = new THREE.DirectionalLight('#b8dd46', 1.1);
      rim.position.set(-4, 2, -3);
      scene.add(rim);

      const controls = new controlsModule.OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.minDistance = 4.4;
      controls.maxDistance = 8.5;
      controls.target.set(0, 0, 0);

      const resize = () => {
        const rect = container.getBoundingClientRect();
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(container);

      const animate = () => {
        if (disposed) return;
        controls.update();
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      };
      animate();
      cleanup = () => {
        observer.disconnect();
        controls.dispose();
        texture.dispose();
        board.geometry.dispose();
        face.dispose();
        woodSide.dispose();
        darkSide.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => { disposed = true; cleanup(); };
  }, [mode, plan]);

  return <section className="model-card" aria-label="Interactive 3D end-grain board model">
    <div className="model-copy"><span className="eyebrow">WEBGL ORBIT VIEWER</span><h2>Spin the board. Then cut it.</h2><p>The pattern is rendered as a physical end-grain slab with thickness, side faces and orbit controls. Switch views to inspect the top map or slice stack.</p></div>
    <div className="viewer-tabs" role="tablist" aria-label="Board view mode">{(['webgl', 'top', 'slices'] as const).map((view) => <button key={view} className={mode === view ? 'active' : ''} onClick={() => setMode(view)}>{view === 'webgl' ? '3D orbit' : view === 'top' ? 'Top map' : 'Slice stack'}</button>)}</div>
    {mode === 'webgl' && <div ref={mountRef} className="webgl-stage" aria-label="Three dimensional orbit viewer" />}
    {mode === 'top' && <div className="model-alt-view"><BoardPreview plan={plan} /></div>}
    {mode === 'slices' && <div className="slice-lab"><div className="slice-rail">{plan.production.flipMap.map((flip, index) => <i key={index} className={flip ? 'flip' : ''} style={{ background: plan.species[index % plan.species.length].color }}><span>{index + 1}</span></i>)}</div><p>{plan.production.sliceCount} slices. Flip every marked piece, rotate to end grain, then glue the final field.</p></div>}
    <div className="model-controls"><span>{plan.spec.length} × {plan.spec.width} × {plan.spec.thickness} mm · {familyName(plan.family)}</span></div>
  </section>;
}

function SheetCards({ plan }: { plan: BoardPlan }) {
  const firstPanel = plan.production.panels[0];
  return <section className="sheet-strip" aria-label="Printable project sheets">
    <article><span>Sheet 01</span><h3>Drawing</h3><p>Dimensioned board face with the source block visible before the crosscut.</p><div className="mini-drawing"><i /> <b>{plan.spec.length} mm</b></div></article>
    <article><span>Sheet 02</span><h3>Buy and cut</h3><p>{format(plan.production.stockLengthNeeded / 1000, 2)} m stock, {format(plan.materials.wastePercent, 1)}% modeled kerf waste, ${format(plan.materials.totalCost, 2)} material estimate.</p><div className="mini-bars">{firstPanel?.strips.map((strip, index) => <i key={index} style={{ flexGrow: strip.width, background: plan.species[strip.species]?.color }} />)}</div></article>
    <article><span>Sheet 03</span><h3>Assembly map</h3><p>{plan.production.sliceCount} slices, {plan.production.flipMap.filter(Boolean).length} planned flips, {plan.production.glueUps} glue-ups.</p><div className="mini-slices">{plan.production.flipMap.slice(0, 10).map((flip, index) => <i key={index} className={flip ? 'flip' : ''} />)}</div></article>
  </section>;
}

function PlanSummary({ plan }: { plan: BoardPlan }) {
  const warnings = plan.risk.warnings.length;
  return <section className="plan-summary" aria-label="Plan summary">
    <article><span>Risk</span><b>{plan.risk.score}</b><small>{plan.risk.level} confidence</small></article>
    <article><span>Slices</span><b>{plan.production.sliceCount}</b><small>{plan.production.cutCount} total cuts</small></article>
    <article><span>Waste</span><b>{format(plan.materials.wastePercent, 1)}%</b><small>{format(plan.production.kerfLoss, 1)} mm kerf model</small></article>
    <article><span>Ticket</span><b>{warnings || 'OK'}</b><small>{warnings ? 'warnings to resolve' : 'ready for dry-fit'}</small></article>
  </section>;
}

function BoardPreview({ plan }: { plan: BoardPlan }) {
  const ratio = `${plan.spec.width} / ${plan.spec.length}`;
  return <section className="instrument preview-card">
    <div className="section-heading"><div><span className="eyebrow">PLAN 01 / TOP VIEW</span><h2>Cut-face map</h2></div><span className="status-dot">LIVE</span></div>
    <div className="dimension-line"><span>{plan.spec.length} mm</span><i /></div>
    <div className="preview-stage">
      <span className="vertical-dimension">{plan.spec.width} mm</span>
      <div className="board-grid" style={{ aspectRatio: ratio, gridTemplateColumns: plan.grid.columnWidths.map((width) => `${width}fr`).join(' '), gridTemplateRows: plan.grid.rowHeights.map((height) => `${height}fr`).join(' ') }}>
        {plan.grid.cells.flatMap((row, rowIndex) => row.map((species, columnIndex) => <div key={`${rowIndex}-${columnIndex}`} className="grain-cell" style={{ backgroundColor: plan.species[species]?.color, '--grain-angle': `${(rowIndex + columnIndex) % 2 ? 28 : -18}deg` } as React.CSSProperties} />))}
      </div>
    </div>
    <div className="legend">{plan.species.map((species) => <span key={species.id}><i style={{ background: species.color }} />{species.name}</span>)}</div>
    <div className="slice-preview"><div className="slice-label"><b>Slice logic</b><span>rotate → alternate flip → glue</span></div><div className="slice-stack">{plan.grid.rowHeights.map((_, index) => <span key={index} className={plan.production.flipMap[index] ? 'flipped' : ''} style={{ background: plan.species[index % plan.species.length].color }} />)}</div></div>
  </section>;
}

function RiskCard({ plan, onSafer }: { plan: BoardPlan; onSafer: () => void }) {
  const tone = plan.risk.level === 'low' ? 'safe' : plan.risk.level === 'moderate' ? 'caution' : 'critical';
  return <section className="instrument risk-card">
    <div className="section-heading"><div><span className="eyebrow">RISK MODEL</span><h2>Build confidence</h2></div><div className={`risk-score ${tone}`}><strong>{plan.risk.score}</strong><span>/ 100<br />{plan.risk.level}</span></div></div>
    <div className="risk-meter"><span style={{ width: `${plan.risk.score}%` }} /></div>
    <div className="warnings">{plan.risk.warnings.slice(0, 4).map((warning) => <article key={warning.code} className={`warning ${warning.severity}`}><span className="warning-mark">{warning.severity === 'critical' ? '!' : warning.severity === 'caution' ? '△' : 'i'}</span><div><b>{warning.title}</b><p>{warning.detail}</p><small>FIX - {warning.fix}</small></div></article>)}</div>
    <button className="safer-button" onClick={onSafer}>Make it safer <span>↘</span></button>
  </section>;
}

function Compiler({ plan }: { plan: BoardPlan }) {
  const steps = [
    ['01', 'Rip strips', `${plan.production.panels.reduce((sum, panel) => sum + panel.strips.reduce((n, run) => n + run.count, 0), 0)} strips`, plan.risk.tinyPieceCount ? 'watch widths' : 'clear'],
    ['02', 'Panel glue-up', `${plan.production.panels.length} panel types`, plan.spec.width > plan.limits.maxClampWidth * .9 ? 'clamp margin' : 'clear'],
    ['03', 'Crosscut slices', `${plan.production.sliceCount} slices`, `${format(plan.production.kerfLoss, 1)} mm kerf`],
    ['04', 'Rotate + map', `${plan.production.flipMap.filter(Boolean).length} flips`, 'label first'],
    ['05', 'Final glue-up', `${plan.spec.width} mm wide`, plan.spec.width > plan.limits.machineWidth ? 'surfacing plan' : 'clear'],
  ];
  return <section className="instrument compiler-card">
    <div className="section-heading"><div><span className="eyebrow">MANUFACTURING COMPILER</span><h2>Build sequence</h2></div><span className="plan-id">#{plan.seed.slice(0, 8).toUpperCase()}</span></div>
    <div className="timeline">{steps.map(([number, title, value, state], index) => <article key={number}><span className="step-number">{number}</span><div><b>{title}</b><strong>{value}</strong><small>{state}</small></div>{index < steps.length - 1 && <i />}</article>)}</div>
    <div className="metrics"><div><span>Cut count</span><b>{plan.production.cutCount}</b></div><div><span>Kerf loss</span><b>{format(plan.production.kerfLoss, 1)} mm</b></div><div><span>Stock needed</span><b>{format(plan.production.stockLengthNeeded / 1000, 2)} m</b></div><div><span>Glue-ups</span><b>{plan.production.glueUps}</b></div></div>
    <div className="panel-table"><div className="table-head"><span>Panel</span><span>Repeats</span><span>Strip sequence</span></div>{plan.production.panels.map((panel) => <div key={panel.id} className="table-row"><b>P{String(panel.id).padStart(2, '0')}</b><span>× {panel.repeats}</span><div className="strip-sequence">{panel.strips.flatMap((run, runIndex) => Array.from({ length: run.count }, (_, index) => <i key={`${runIndex}-${index}`} title={`${plan.species[run.species]?.name}: ${format(run.width, 1)} mm`} style={{ background: plan.species[run.species]?.color, flexGrow: run.width }} />))}</div></div>)}</div>
  </section>;
}

export function MakerTicket({ plan }: { plan: BoardPlan }) {
  return <section id="ticket" className="maker-ticket" data-testid="maker-ticket">
    <header><div><span>EDGEBOARD LAB / MAKER TICKET</span><h1>{familyName(plan.family)}</h1></div><b>PLAN #{plan.seed.slice(0, 8).toUpperCase()}</b></header>
    <div className="ticket-summary"><div><small>FINAL DIMENSIONS</small><strong>{plan.spec.length} × {plan.spec.width} × {plan.spec.thickness} mm</strong></div><div><small>RISK SCORE</small><strong>{plan.risk.score} / 100 - {plan.risk.level}</strong></div><div><small>SAW KERF</small><strong>{plan.limits.sawKerf} mm</strong></div></div>
    <h2>Material list</h2><table><thead><tr><th>Species</th><th>Volume</th><th>Stock length share</th><th>Estimate</th></tr></thead><tbody>{plan.materials.lines.map((line) => <tr key={line.species}><td>{plan.species[line.species].name}</td><td>{format(line.volumeLiters, 2)} L</td><td>{format(line.stockLength / 1000, 2)} m</td><td>${format(line.estimatedCost, 2)}</td></tr>)}</tbody></table>
    <h2>Cut sequence</h2><ol><li>Rip and label the strips for {plan.production.panels.length} panel configurations.</li><li>Glue the first-stage panels; verify width before clamping.</li><li>Crosscut {plan.production.sliceCount} slices and preserve their order.</li><li>Rotate every slice to end grain; flip positions {plan.production.flipMap.map((flip, index) => flip ? index + 1 : null).filter(Boolean).join(', ') || 'none'}.</li><li>Dry-fit, glue the final field, then surface to {plan.spec.thickness} mm.</li></ol>
    <h2>Panel diagram</h2><div className="ticket-diagram">{plan.grid.cells.flat().map((species, index) => <i key={index} style={{ background: plan.species[species]?.color }} />)}</div>
    <h2>Risk warnings</h2><ul>{plan.risk.warnings.map((warning) => <li key={warning.code}><b>{warning.title}:</b> {warning.fix}</li>)}</ul>
    <h2>Dry-fit checklist</h2><div className="checklist"><span>□ Grain orientation checked</span><span>□ Slice order marked</span><span>□ Clamp layout rehearsed</span><span>□ Glue and cauls ready</span><span>□ Final dimensions verified</span><span>□ Surfacing method confirmed</span></div>
    <footer>Generated from shop constraints • Verify every measurement at the machine</footer>
  </section>;
}

export default function App() {
  const [spec, setSpec] = useState(initialSpec);
  const [limits, setLimits] = useState(initialLimits);
  const [family, setFamily] = useState<PatternFamily>('woven-bands');
  const [complexity, setComplexity] = useState(5);
  const [speciesCount, setSpeciesCount] = useState(3);
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>('balanced');
  const [seed, setSeed] = useState('bench-42');
  const [revision, setRevision] = useState(0);
  const computed = useMemo(() => createBoardPlan(spec, limits, { seed: `${seed}-${revision}`, family, complexity: riskTolerance === 'low' ? Math.min(complexity, 5) : complexity, riskTolerance, speciesCount }), [spec, limits, seed, revision, family, complexity, riskTolerance, speciesCount]);
  const [safeOverride, setSafeOverride] = useState<BoardPlan | null>(null);
  const plan = safeOverride ?? computed;
  const updateSpec = (key: keyof BoardSpec, value: number) => { setSafeOverride(null); setSpec((current) => ({ ...current, [key]: value })); };
  const updateLimits = (key: keyof ShopLimits, value: number) => { setSafeOverride(null); setLimits((current) => ({ ...current, [key]: value })); };
  const regenerate = () => { setSafeOverride(null); setRevision((value) => value + 1); };
  const applyPreset = (preset: typeof shopPresets[number]) => {
    setSafeOverride(null);
    setSpec(preset.spec);
    setLimits(preset.limits);
    setFamily(preset.family);
    setComplexity(preset.complexity);
    setRiskTolerance(preset.riskTolerance);
    setSpeciesCount(preset.speciesCount);
    setSeed(preset.seed);
    setRevision((value) => value + 1);
  };

  return <>
    <header className="app-header"><div className="brand-mark">EB<span>+</span></div><div className="brand"><h1>EdgeBoard Lab</h1><p>Constraint-first generator for buildable end-grain boards.</p></div><nav className="header-meta" aria-label="Project actions"><span>WORKBENCH / {new Date().getFullYear()}</span><a href="#ticket">Maker ticket</a><button onClick={() => window.print()}>Print <b>⌘P</b></button></nav></header>
    <section className="intro">
      <div className="intro-copy"><span className="eyebrow">CONSTRAINT-FIRST BOARD GENERATOR</span><h1>Design the face. Prove the build.</h1><p>EdgeBoard Lab turns saw kerf, clamp capacity, stock length and safe strip width into a manufacturable end-grain cutting board plan: pattern, panels, slices, risk report and print-ready maker ticket.</p><div className="intro-actions"><button onClick={regenerate}>Generate new plan</button><button className="ghost" onClick={() => window.print()}>Print ticket</button></div></div>
      <div className="intro-board" aria-label="Selected board 3D preview"><BoardModel3D plan={plan} /></div>
    </section>
    <PlanSummary plan={plan} />
    <SheetCards plan={plan} />
    <main className="app-shell">
      <aside className="controls">
        <div className="controls-title"><span className="eyebrow">INPUT ARRAY</span><h2>Shop constraints</h2><p>Start with a shop profile, then tune the limits. The design changes before a risky cut reaches the saw.</p></div>
        <div className="preset-grid">{shopPresets.map((preset) => <button key={preset.label} onClick={() => applyPreset(preset)}><b>{preset.label}</b><span>{preset.note}</span></button>)}</div>
        <fieldset><legend>01 / Final board</legend><div className="field-grid"><NumberField label="Length" value={spec.length} min={200} max={900} onChange={(v) => updateSpec('length', v)} /><NumberField label="Width" value={spec.width} min={150} max={600} onChange={(v) => updateSpec('width', v)} /><NumberField label="Thickness" value={spec.thickness} min={25} max={80} onChange={(v) => updateSpec('thickness', v)} /></div></fieldset>
        <fieldset><legend>02 / Machine envelope</legend><div className="field-grid"><NumberField label="Saw kerf" value={limits.sawKerf} min={1} max={8} step={0.1} onChange={(v) => updateLimits('sawKerf', v)} /><NumberField label="Clamp width" value={limits.maxClampWidth} min={100} max={1000} onChange={(v) => updateLimits('maxClampWidth', v)} /><NumberField label="Stock length" value={limits.stockLength} min={300} max={4000} onChange={(v) => updateLimits('stockLength', v)} /><NumberField label="Safe strip" value={limits.minStripWidth} min={10} max={80} onChange={(v) => updateLimits('minStripWidth', v)} /><NumberField label="Planer / sander" value={limits.machineWidth} min={100} max={1000} onChange={(v) => updateLimits('machineWidth', v)} /></div></fieldset>
        <fieldset><legend>03 / Pattern protocol</legend><label className="select-field"><span>Pattern family</span><select value={family} onChange={(event) => { setSafeOverride(null); setFamily(event.target.value as PatternFamily); }}><>{families.map((item) => <option key={item.value} value={item.value}>{item.label} - {item.note}</option>)}</></select></label><div className="range-field"><div><span>Complexity</span><b>{complexity} / 10</b></div><input type="range" min="1" max="10" value={complexity} onChange={(event) => { setSafeOverride(null); setComplexity(Number(event.target.value)); }} /></div><label className="select-field"><span>Species count</span><select value={speciesCount} onChange={(event) => { setSafeOverride(null); setSpeciesCount(Number(event.target.value)); }}>{defaultSpecies.slice(1).map((_, index) => <option key={index + 2} value={index + 2}>{index + 2} species</option>)}</select></label><div className="tolerance"><span>Risk tolerance</span><div>{(['low', 'balanced', 'high'] as RiskTolerance[]).map((value) => <button key={value} className={riskTolerance === value ? 'active' : ''} onClick={() => { setSafeOverride(null); setRiskTolerance(value); }}>{value}</button>)}</div></div><label className="seed-field"><span>Seed</span><input value={seed} onChange={(event) => { setSafeOverride(null); setSeed(event.target.value); }} /><button onClick={regenerate} title="New deterministic revision">↻</button></label></fieldset>
        <button className="generate-button" onClick={regenerate}><span>Generate viable plan</span><b>→</b></button>
      </aside>
      <div className="workspace"><div className="workspace-bar"><div><span className="pulse" />CONSTRAINTS COMPILED</div><span>{familyName(plan.family)} / {plan.grid.cells.length} × {plan.grid.cells[0].length} MODULES</span></div><div className="dashboard-grid"><BoardPreview plan={plan} /><RiskCard plan={plan} onSafer={() => setSafeOverride(createSaferPlan(plan))} /><Compiler plan={plan} /><section className="instrument material-card"><div className="section-heading"><div><span className="eyebrow">MATERIAL LEDGER</span><h2>Purchase estimate</h2></div><b>${format(plan.materials.totalCost, 2)}</b></div>{plan.materials.lines.map((line) => <div className="material-row" key={line.species}><i style={{ background: plan.species[line.species].color }} /><span>{plan.species[line.species].name}<small>{format(line.volumeLiters, 2)} L / {format(line.stockLength / 1000, 2)} m share</small></span><b>${format(line.estimatedCost, 2)}</b></div>)}<div className="waste"><span>Modeled kerf waste</span><b>{format(plan.materials.wastePercent, 1)}%</b></div></section></div></div>
    </main>
    <MakerTicket plan={plan} />
  </>;
}
