import { useEffect, useMemo, useRef, useState } from 'react';
import { createBoardPlan, createSaferPlan, defaultSpecies } from './core/index';
import type { BoardPlan, BoardSpec, PatternFamily, RiskTolerance, ShopLimits } from './core/index';

const families: { value: PatternFamily; label: string; note: string }[] = [
  { value: 'rail-fence', label: 'Рейковый ритм', note: 'стабильный линейный рисунок' },
  { value: 'woven-bands', label: 'Плетёные полосы', note: 'переплетённые повторы' },
  { value: 'offset-brick', label: 'Смещённый кирпич', note: 'шахматные блоки' },
  { value: 'gradient-lanes', label: 'Градиентные дорожки', note: 'мягкий переход пород' },
  { value: 'framed-checker', label: 'Шахматка в раме', note: 'чёткий периметр' },
  { value: 'split-chevron', label: 'Разрезанный шеврон', note: 'направленный центр' },
  { value: 'barcode-stripe', label: 'Штриховые полосы', note: 'неровный ритм' },
  { value: 'asymmetric-accent', label: 'Асимметричный акцент', note: 'смещённый маркер' },
];

const initialSpec: BoardSpec = { length: 460, width: 310, thickness: 42 };
const initialLimits: ShopLimits = { sawKerf: 3.2, maxClampWidth: 380, stockLength: 1000, minStripWidth: 28, machineWidth: 330 };

const shopPresets: { label: string; spec: BoardSpec; limits: ShopLimits; family: PatternFamily; complexity: number; riskTolerance: RiskTolerance; speciesCount: number; seed: string; note: string }[] = [
  { label: 'Малая мастерская', spec: { length: 360, width: 240, thickness: 38 }, limits: { sawKerf: 3.0, maxClampWidth: 280, stockLength: 800, minStripWidth: 32, machineWidth: 260 }, family: 'rail-fence', complexity: 4, riskTolerance: 'low', speciesCount: 3, seed: 'safe-shop', note: 'меньше тонких деталей, запас по струбцинам' },
  { label: 'Витринная доска', spec: { length: 520, width: 340, thickness: 45 }, limits: { sawKerf: 3.2, maxClampWidth: 420, stockLength: 1200, minStripWidth: 24, machineWidth: 360 }, family: 'split-chevron', complexity: 7, riskTolerance: 'balanced', speciesCount: 4, seed: 'showpiece', note: 'выразительный центр без фантазийных склеек' },
  { label: 'Сборка за выходные', spec: { length: 420, width: 300, thickness: 40 }, limits: { sawKerf: 3.2, maxClampWidth: 360, stockLength: 1000, minStripWidth: 30, machineWidth: 330 }, family: 'offset-brick', complexity: 5, riskTolerance: 'balanced', speciesCount: 3, seed: 'weekend', note: 'простой повтор, понятный билет, меньше сюрпризов' },
  { label: 'Контрастный шеврон', spec: { length: 480, width: 320, thickness: 44 }, limits: { sawKerf: 3.2, maxClampWidth: 390, stockLength: 1100, minStripWidth: 26, machineWidth: 340 }, family: 'split-chevron', complexity: 8, riskTolerance: 'high', speciesCount: 4, seed: 'contrast-chevron', note: 'смелый ритм и четыре породы для акцентной доски' },
];

const familyName = (family: PatternFamily) => families.find((item) => item.value === family)?.label ?? family;
const format = (value: number, digits = 0) => value.toFixed(digits);

const riskLevelRu = (level: BoardPlan['risk']['level']) => level === 'low' ? 'низкий' : level === 'moderate' ? 'средний' : 'высокий';
const toleranceRu = (value: RiskTolerance) => value === 'low' ? 'осторожно' : value === 'balanced' ? 'баланс' : 'смело';
const warningRu = (warning: BoardPlan['risk']['warnings'][number]) => ({
  thin: ['Тонкие ламели', 'Часть ячеек близко к минимально безопасной ширине.', 'Уменьши сложность или увеличь минимальную ширину ламели.'],
  clamp: ['Не хватает струбцин', 'Панель шире указанного предела струбцин.', 'Уменьши ширину доски или склей через подпакеты.'],
  'clamp-margin': ['Малый запас струбцин', 'Склейка использует больше 90% доступной ширины.', 'Оставь запас хода или уменьши ширину.'],
  machine: ['Не проходит по станку', 'Финальная ширина больше указанного рейсмуса/шлифовки.', 'Планируй фрезерные салазки или уменьши ширину.'],
  movement: ['Разное движение пород', 'У выбранных пород разные коэффициенты сезонного движения.', 'Проверь влажность и совместимость направления волокон.'],
  'glue-ups': ['Многоступенчатая склейка', 'План требует аккуратной последовательности склеек.', 'Маркируй пакеты и репетируй сухую сборку.'],
  clear: ['Запасы в норме', 'Модель не видит близких отказов по ограничениям.', 'Перед распилом всё равно проверь размеры на станке.'],
} as Record<string, [string, string, string]>)[warning.code] ?? [warning.title, warning.detail, warning.fix];

function NumberField({ label, value, min, max, step = 1, unit = 'мм', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><span className="input-shell"><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /><b>{unit}</b></span></label>;
}



function BoardModel3D({ plan }: { plan: BoardPlan }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<'webgl' | 'top' | 'slices' | 'sheets'>('webgl');

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
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      camera.position.set(5.4, 4.4, 6.4);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      container.replaceChildren(renderer.domElement);

      const length = 4.8;
      const width = Math.max(2.2, Math.min(3.6, plan.spec.width / plan.spec.length * length));
      const thickness = Math.max(.32, Math.min(.72, plan.spec.thickness / 70));
      const woodSide = new THREE.MeshStandardMaterial({ color: '#855538', roughness: .68, metalness: 0 });
      const darkSide = new THREE.MeshStandardMaterial({ color: '#3b241a', roughness: .82, metalness: 0 });
      const face = new THREE.MeshPhysicalMaterial({ map: texture, roughness: .46, clearcoat: .18, clearcoatRoughness: .72 });
      const board = new THREE.Mesh(new THREE.BoxGeometry(length, thickness, width, 24, 3, 16), [woodSide, woodSide, face, darkSide, woodSide, woodSide]);
      board.rotation.y = -.35;
      board.castShadow = true;
      board.receiveShadow = true;
      scene.add(board);

      const bevel = new THREE.LineSegments(new THREE.EdgesGeometry(board.geometry), new THREE.LineBasicMaterial({ color: '#1b2d32', transparent: true, opacity: .45 }));
      board.add(bevel);

      const table = new THREE.Mesh(new THREE.CircleGeometry(5.6, 96), new THREE.MeshStandardMaterial({ color: '#0b1215', roughness: 1, transparent: true, opacity: .6 }));
      table.rotation.x = -Math.PI / 2;
      table.position.y = -thickness / 2 - .18;
      table.receiveShadow = true;
      scene.add(table);

      scene.add(new THREE.HemisphereLight('#fff8e8', '#183139', 2.2));
      const key = new THREE.DirectionalLight('#fff4d6', 3.4);
      key.position.set(3, 5, 4);
      key.castShadow = true;
      scene.add(key);
      const rim = new THREE.DirectionalLight('#b8dd46', 1.1);
      rim.position.set(-4, 2, -3);
      scene.add(rim);

      const controls = new controlsModule.OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.minDistance = 4.4;
      controls.maxDistance = 8.5;
      controls.maxPolarAngle = Math.PI * .47;
      controls.minPolarAngle = Math.PI * .14;
      controls.autoRotate = true;
      controls.autoRotateSpeed = .45;
      controls.target.set(0, 0, 0);
      renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; }, { once: true });

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
        bevel.geometry.dispose();
        (bevel.material as InstanceType<typeof THREE.LineBasicMaterial>).dispose();
        table.geometry.dispose();
        (table.material as InstanceType<typeof THREE.MeshStandardMaterial>).dispose();
        face.dispose();
        woodSide.dispose();
        darkSide.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => { disposed = true; cleanup(); };
  }, [mode, plan]);

  return <section className="model-card" aria-label="Интерактивная 3D-модель торцевой доски">
    <div className="model-copy"><span className="eyebrow">ЖИВАЯ МОДЕЛЬ / 3D</span><h2>Доска до первого реза.</h2><p>Проверь торцевой рисунок, толщину и пропорции. Потяни, чтобы вращать; колесо меняет масштаб.</p></div>
    <div className="viewer-tabs" role="tablist" aria-label="Режим просмотра доски">{(['webgl', 'top', 'slices', 'sheets'] as const).map((view) => <button key={view} id={`tab-${view}`} role="tab" aria-selected={mode === view} aria-controls={`panel-${view}`} className={mode === view ? 'active' : ''} onClick={() => setMode(view)}>{view === 'webgl' ? '3D' : view === 'top' ? 'Карта торца' : view === 'slices' ? 'Пакет срезов' : 'Листы'}</button>)}</div>
    {mode === 'webgl' && <div ref={mountRef} id="panel-webgl" role="tabpanel" aria-labelledby="tab-webgl" className="webgl-stage" aria-label="Трёхмерный просмотр доски" />}
    {mode === 'top' && <div id="panel-top" role="tabpanel" aria-labelledby="tab-top" className="model-alt-view"><BoardPreview plan={plan} /></div>}
    {mode === 'slices' && <div id="panel-slices" role="tabpanel" aria-labelledby="tab-slices" className="slice-lab"><div className="slice-rail">{plan.production.flipMap.map((flip, index) => <i key={index} className={flip ? 'flip' : ''} style={{ background: plan.species[index % plan.species.length].color }}><span>{index + 1}</span></i>)}</div><p>{plan.production.sliceCount} срезов. Разверни отмеченные детали, поставь на торец и склей финальное поле.</p></div>}
    {mode === 'sheets' && <div id="panel-sheets" role="tabpanel" aria-labelledby="tab-sheets" className="model-sheet-view"><article><span>01</span><b>Чертёж</b><small>{plan.spec.length} × {plan.spec.width} мм</small></article><article><span>02</span><b>Карта распила</b><small>{plan.production.cutCount} резов</small></article><article><span>03</span><b>Сборка</b><small>{plan.production.glueUps} склеек</small></article></div>}
    <div className="model-controls"><span className="orbit-hint">↻ вращать · ± масштаб</span><span>{plan.spec.length} × {plan.spec.width} × {plan.spec.thickness} мм · {familyName(plan.family)}</span></div>
  </section>;
}

function SheetCards({ plan }: { plan: BoardPlan }) {
  const firstПанель = plan.production.panels[0];
  return <section id="project-sheets" className="sheet-section" aria-label="Печатные листы проекта">
    <header className="sheet-section-title"><div><span className="eyebrow">КОМПЛЕКТ МАСТЕРА</span><h2>Три листа — от идеи до склейки</h2></div><p>Размеры, закупка и порядок деталей собраны в один печатный проект.</p></header>
    <div className="sheet-strip">
      <article><div className="sheet-head"><span>Лист 01</span><b>М 1:5</b></div><h3>Габаритный чертёж</h3><div className="sheet-drawing"><div className="drawing-board" /><i className="dim-x">{plan.spec.length} мм</i><i className="dim-y">{plan.spec.width} мм</i></div><footer><span>Толщина</span><b>{plan.spec.thickness} мм</b><span>Узор</span><b>{familyName(plan.family)}</b></footer></article>
      <article><div className="sheet-head"><span>Лист 02</span><b>ВЕДОМОСТЬ</b></div><h3>Закупка и распил</h3><div className="mini-bars">{firstПанель?.strips.map((strip, index) => <i key={index} style={{ flexGrow: strip.width, background: plan.species[strip.species]?.color }} />)}</div><div className="sheet-stats"><span>Заготовка <b>{format(plan.production.stockLengthNeeded / 1000, 2)} м</b></span><span>Резы <b>{plan.production.cutCount}</b></span><span>Пропил <b>{plan.limits.sawKerf} мм</b></span></div><footer><span>Потери</span><b>{format(plan.materials.wastePercent, 1)}%</b><span>Объём</span><b>{format(plan.materials.lines.reduce((sum, line) => sum + line.volumeLiters, 0), 2)} л</b></footer></article>
      <article><div className="sheet-head"><span>Лист 03</span><b>ПОРЯДОК</b></div><h3>Карта сборки</h3><div className="mini-slices">{plan.production.flipMap.slice(0, 12).map((flip, index) => <i key={index} className={flip ? 'flip' : ''}><small>{index + 1}</small></i>)}</div><div className="assembly-route"><span>Распустить</span><i>→</i><span>Склеить</span><i>→</i><span>Развернуть</span></div><footer><span>Срезов</span><b>{plan.production.sliceCount}</b><span>Склеек</span><b>{plan.production.glueUps}</b></footer></article>
    </div>
  </section>;
}

function PlanSummary({ plan }: { plan: BoardPlan }) {
  const warnings = plan.risk.warnings.length;
  return <section className="plan-summary" aria-label="Сводка плана">
    <article><span>Риск</span><b>{plan.risk.score}</b><small>{riskLevelRu(plan.risk.level)} риск</small></article>
    <article><span>Срезы</span><b>{plan.production.sliceCount}</b><small>{plan.production.cutCount} резов всего</small></article>
    <article><span>Отход</span><b>{format(plan.materials.wastePercent, 1)}%</b><small>{format(plan.production.kerfLoss, 1)} мм на пропил</small></article>
    <article><span>Проверка</span><b>{warnings || 'ГОТОВО'}</b><small>{warnings ? 'замечаний к плану' : 'к сухой сборке'}</small></article>
  </section>;
}

function BoardPreview({ plan }: { plan: BoardPlan }) {
  const ratio = `${plan.spec.width} / ${plan.spec.length}`;
  return <section className="instrument preview-card">
    <div className="section-heading"><div><span className="eyebrow">ЛИСТ 01 / ВИД СВЕРХУ</span><h2>Карта торца</h2></div><span className="status-dot">ЖИВОЙ РАСЧЁТ</span></div>
    <div className="dimension-line"><span>{plan.spec.length} мм</span><i /></div>
    <div className="preview-stage">
      <span className="vertical-dimension">{plan.spec.width} мм</span>
      <div className="board-grid" style={{ aspectRatio: ratio, gridTemplateColumns: plan.grid.columnWidths.map((width) => `${width}fr`).join(' '), gridTemplateRows: plan.grid.rowHeights.map((height) => `${height}fr`).join(' ') }}>
        {plan.grid.cells.flatMap((row, rowIndex) => row.map((species, columnIndex) => <div key={`${rowIndex}-${columnIndex}`} className="grain-cell" style={{ backgroundColor: plan.species[species]?.color, '--grain-angle': `${(rowIndex + columnIndex) % 2 ? 28 : -18}deg` } as React.CSSProperties} />))}
      </div>
    </div>
    <div className="legend">{plan.species.map((species) => <span key={species.id}><i style={{ background: species.color }} />{species.name}</span>)}</div>
    <div className="slice-preview"><div className="slice-label"><b>Логика срезов</b><span>повернуть → чередовать → склеить</span></div><div className="slice-stack">{plan.grid.rowHeights.map((_, index) => <span key={index} className={plan.production.flipMap[index] ? 'flipped' : ''} style={{ background: plan.species[index % plan.species.length].color }} />)}</div></div>
  </section>;
}

function RiskCard({ plan, onSafer }: { plan: BoardPlan; onSafer: () => void }) {
  const tone = plan.risk.level === 'low' ? 'safe' : plan.risk.level === 'moderate' ? 'caution' : 'critical';
  return <section className="instrument risk-card">
    <div className="section-heading"><div><span className="eyebrow">МОДЕЛЬ РИСКА</span><h2>Надёжность сборки</h2></div><div className={`risk-score ${tone}`}><strong>{plan.risk.score}</strong><span>/ 100<br />{riskLevelRu(plan.risk.level)}</span></div></div>
    <div className="risk-meter"><span style={{ width: `${plan.risk.score}%` }} /></div>
    <div className="warnings">{plan.risk.warnings.slice(0, 4).map((warning) => { const [title, detail, fix] = warningRu(warning); return <article key={warning.code} className={`warning ${warning.severity}`}><span className="warning-mark">{warning.severity === 'critical' ? '!' : warning.severity === 'caution' ? '△' : 'i'}</span><div><b>{title}</b><p>{detail}</p><small>РЕШЕНИЕ — {fix}</small></div></article>; })}</div>
    <button className="safer-button" onClick={onSafer}>Сделать безопаснее <span>↘</span></button>
  </section>;
}

function Compiler({ plan }: { plan: BoardPlan }) {
  const steps = [
    ['01', 'Распустить рейки', `${plan.production.panels.reduce((sum, panel) => sum + panel.strips.reduce((n, run) => n + run.count, 0), 0)} реек`, plan.risk.tinyPieceCount ? 'проверить ширину' : 'норма'],
    ['02', 'Склейка панелей', `${plan.production.panels.length} типов панелей`, plan.spec.width > plan.limits.maxClampWidth * .9 ? 'запас струбцин' : 'норма'],
    ['03', 'Поперечный рез', `${plan.production.sliceCount} срезов`, `${format(plan.production.kerfLoss, 1)} мм пропил`],
    ['04', 'Разворот и карта', `${plan.production.flipMap.filter(Boolean).length} переворотов`, 'сначала маркировка'],
    ['05', 'Финальная склейка', `${plan.spec.width} мм ширина`, plan.spec.width > plan.limits.machineWidth ? 'план строгания' : 'норма'],
  ];
  return <section className="instrument compiler-card">
    <div className="section-heading"><div><span className="eyebrow">ТЕХКАРТА</span><h2>Порядок работ</h2></div><span className="plan-id">#{plan.seed.slice(0, 8).toUpperCase()}</span></div>
    <div className="timeline">{steps.map(([number, title, value, state], index) => <article key={number}><span className="step-number">{number}</span><div><b>{title}</b><strong>{value}</strong><small>{state}</small></div>{index < steps.length - 1 && <i />}</article>)}</div>
    <div className="metrics"><div><span>Резов</span><b>{plan.production.cutCount}</b></div><div><span>Потери пропила</span><b>{format(plan.production.kerfLoss, 1)} мм</b></div><div><span>Нужно заготовки</span><b>{format(plan.production.stockLengthNeeded / 1000, 2)} м</b></div><div><span>Склеек</span><b>{plan.production.glueUps}</b></div></div>
    <div className="panel-table"><div className="table-head"><span>Панель</span><span>Повторы</span><span>Последовательность реек</span></div>{plan.production.panels.map((panel) => <div key={panel.id} className="table-row"><b>P{String(panel.id).padStart(2, '0')}</b><span>× {panel.repeats}</span><div className="strip-sequence">{panel.strips.flatMap((run, runIndex) => Array.from({ length: run.count }, (_, index) => <i key={`${runIndex}-${index}`} title={`${plan.species[run.species]?.name}: ${format(run.width, 1)} мм`} style={{ background: plan.species[run.species]?.color, flexGrow: run.width }} />))}</div></div>)}</div>
  </section>;
}

export function MakerTicket({ plan }: { plan: BoardPlan }) {
  return <section id="ticket" className="maker-ticket" data-testid="maker-ticket">
    <header><div><span>EDGEBOARD LAB / ЛИСТ МАСТЕРА</span><h1>{familyName(plan.family)}</h1></div><b>ПЛАН #{plan.seed.slice(0, 8).toUpperCase()}</b></header>
    <div className="ticket-summary"><div><small>ГОТОВЫЙ РАЗМЕР</small><strong>{plan.spec.length} × {plan.spec.width} × {plan.spec.thickness} мм</strong></div><div><small>ОЦЕНКА РИСКА</small><strong>{plan.risk.score} / 100 — {riskLevelRu(plan.risk.level)}</strong></div><div><small>ПРОПИЛ ПИЛЫ</small><strong>{plan.limits.sawKerf} мм</strong></div></div>
    <h2>Материал</h2><table><thead><tr><th>Порода</th><th>Объём</th><th>Доля длины</th><th>Оценка</th></tr></thead><tbody>{plan.materials.lines.map((line) => <tr key={line.species}><td>{plan.species[line.species].name}</td><td>{format(line.volumeLiters, 2)} л</td><td>{format(line.stockLength / 1000, 2)} м</td><td>{format(line.estimatedCost, 2)} у. е.</td></tr>)}</tbody></table>
    <h2>Порядок реза</h2><ol><li>Распусти и промаркируй рейки для {plan.production.panels.length} типов панелей.</li><li>Склей панели первого этапа и проверь ширину до затяжки струбцин.</li><li>Нарежь {plan.production.sliceCount} поперечных срезов и сохрани их порядок.</li><li>Поставь каждый срез на торец; переверни позиции {plan.production.flipMap.map((flip, index) => flip ? index + 1 : null).filter(Boolean).join(', ') || 'нет'}.</li><li>Сделай сухую сборку, склей финальное поле и выведи толщину {plan.spec.thickness} мм.</li></ol>
    <h2>Схема панели</h2><div className="ticket-diagram">{plan.grid.cells.flat().map((species, index) => <i key={index} style={{ background: plan.species[species]?.color }} />)}</div>
    <h2>Предупреждения по риску</h2><ul>{plan.risk.warnings.map((warning) => <li key={warning.code}><b>{warningRu(warning)[0]}:</b> {warningRu(warning)[2]}</li>)}</ul>
    <h2>Чек-лист сухой сборки</h2><div className="checklist"><span>□ Волокна проверены</span><span>□ Срезы пронумерованы</span><span>□ Струбцины разложены</span><span>□ Клей и прижимы готовы</span><span>□ Финальные размеры проверены</span><span>□ Метод выравнивания понятен</span></div>
    <footer>Сгенерировано из ограничений мастерской • Проверь каждый размер у станка</footer>
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
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
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

  return <div className="app-root" data-theme={theme}>
    <header className="app-header"><div className="brand-mark">EB<span>+</span></div><div className="brand"><h1>EdgeBoard Lab</h1><p>Генератор реализуемых торцевых досок от ограничений мастерской.</p></div><nav className="header-meta" aria-label="Действия проекта"><span>ВЕРСТАК / {new Date().getFullYear()}</span><a href="#project-sheets">Листы проекта</a><button className="theme-toggle" title="Переключить светлую/тёмную тему" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Тема: тёмная' : 'Тема: светлая'}</button><button onClick={() => window.print()}>Печать <b>Ctrl/⌘P</b></button></nav></header>
    <section className="intro">
      <div className="intro-copy"><span className="eyebrow">ТОРЦЕВАЯ ДОСКА / ОТ УЗОРА ДО СТАНКА</span><h1>Спроектируй.<br /><em>Потом пили.</em></h1><p>Интерактивная доска, раскрой и проверка мастерской в одном проекте. Реальные размеры, понятная сборка, никакой геометрии «на глаз».</p><div className="intro-actions"><button onClick={regenerate}>Создать новый узор <b>↗</b></button><a className="ghost" href="#workbench">Открыть верстак ↓</a></div><div className="hero-proof"><span><b>{families.length}</b> семейств узора</span><span><b>{plan.risk.score}/100</b> оценка риска</span><span><b>3</b> листа проекта</span></div></div>
      <div className="intro-board" aria-label="3D-превью выбранной доски"><BoardModel3D plan={plan} /></div>
    </section>
    <PlanSummary plan={plan} />
    <SheetCards plan={plan} />
    <main className="app-shell" id="workbench">
      <aside className="controls">
        <div className="controls-title"><span className="eyebrow">ВХОДНЫЕ ДАННЫЕ</span><h2>Ограничения мастерской</h2><p>Начни с профиля мастерской и настрой лимиты. Дизайн меняется до того, как опасный рез дошёл до пилы.</p></div>
        <div className="preset-grid">{shopPresets.map((preset) => <button key={preset.label} onClick={() => applyPreset(preset)}><b>{preset.label}</b><span>{preset.note}</span></button>)}</div>
        <fieldset><legend>01 / Финальная доска</legend><div className="field-grid"><NumberField label="Длина" value={spec.length} min={200} max={900} onChange={(v) => updateSpec('length', v)} /><NumberField label="Ширина" value={spec.width} min={150} max={600} onChange={(v) => updateSpec('width', v)} /><NumberField label="Толщина" value={spec.thickness} min={25} max={80} onChange={(v) => updateSpec('thickness', v)} /></div></fieldset>
        <fieldset><legend>02 / Станки и оснастка</legend><div className="field-grid"><NumberField label="Пропил пилы" value={limits.sawKerf} min={1} max={8} step={0.1} onChange={(v) => updateLimits('sawKerf', v)} /><NumberField label="Ширина струбцин" value={limits.maxClampWidth} min={100} max={1000} onChange={(v) => updateLimits('maxClampWidth', v)} /><NumberField label="Длина заготовки" value={limits.stockLength} min={300} max={4000} onChange={(v) => updateLimits('stockLength', v)} /><NumberField label="Безопасная ламель" value={limits.minStripWidth} min={10} max={80} onChange={(v) => updateLimits('minStripWidth', v)} /><NumberField label="Рейсмус / шлифовка" value={limits.machineWidth} min={100} max={1000} onChange={(v) => updateLimits('machineWidth', v)} /></div></fieldset>
        <fieldset><legend>03 / Протокол узора</legend><label className="select-field"><span>Семейство узора</span><select value={family} onChange={(event) => { setSafeOverride(null); setFamily(event.target.value as PatternFamily); }}><>{families.map((item) => <option key={item.value} value={item.value}>{item.label} - {item.note}</option>)}</></select></label><div className="range-field"><div><span>Сложность</span><b>{complexity} / 10</b></div><input type="range" min="1" max="10" value={complexity} onChange={(event) => { setSafeOverride(null); setComplexity(Number(event.target.value)); }} /></div><label className="select-field"><span>Количество пород</span><select value={speciesCount} onChange={(event) => { setSafeOverride(null); setSpeciesCount(Number(event.target.value)); }}>{defaultSpecies.slice(1).map((_, index) => <option key={index + 2} value={index + 2}>{index + 2} породы</option>)}</select></label><div className="tolerance"><span>Допуск риска</span><div>{(['low', 'balanced', 'high'] as RiskTolerance[]).map((value) => <button key={value} className={riskTolerance === value ? 'active' : ''} onClick={() => { setSafeOverride(null); setRiskTolerance(value); }}>{toleranceRu(value)}</button>)}</div></div><label className="seed-field"><span>Ключ генерации</span><input value={seed} onChange={(event) => { setSafeOverride(null); setSeed(event.target.value); }} /><button onClick={regenerate} title="Новая версия">↻</button></label></fieldset>
        <button className="generate-button" onClick={regenerate}><span>Сгенерировать рабочий план</span><b>→</b></button>
      </aside>
      <div className="workspace"><div className="workspace-bar"><div><span className="pulse" />ОГРАНИЧЕНИЯ СОБРАНЫ</div><span>{familyName(plan.family)} / {plan.grid.cells.length} × {plan.grid.cells[0].length} МОДУЛЕЙ</span></div><div className="dashboard-grid"><BoardPreview plan={plan} /><RiskCard plan={plan} onSafer={() => setSafeOverride(createSaferPlan(plan))} /><Compiler plan={plan} /><section className="instrument material-card"><div className="section-heading"><div><span className="eyebrow">ВЕДОМОСТЬ МАТЕРИАЛА</span><h2>Оценка закупки</h2></div><b>{format(plan.materials.totalCost, 2)} у. е.</b></div>{plan.materials.lines.map((line) => <div className="material-row" key={line.species}><i style={{ background: plan.species[line.species].color }} /><span>{plan.species[line.species].name}<small>{format(line.volumeLiters, 2)} л / {format(line.stockLength / 1000, 2)} м доля</small></span><b>{format(line.estimatedCost, 2)} у. е.</b></div>)}<div className="waste"><span>Потери на пропил</span><b>{format(plan.materials.wastePercent, 1)}%</b></div></section></div></div>
    </main>
    <MakerTicket plan={plan} />
  </div>;
}
