import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App, { MakerTicket } from './App';
import { createBoardPlan } from './core/index';

const plan = createBoardPlan(
  { length: 460, width: 310, thickness: 42 },
  { sawKerf: 3.2, maxClampWidth: 380, stockLength: 1000, minStripWidth: 28, machineWidth: 330 },
  { seed: 'ticket', family: 'woven-bands', complexity: 5, riskTolerance: 'balanced', speciesCount: 3 },
);

describe('maker ticket', () => {
  const html = renderToStaticMarkup(<MakerTicket plan={plan} />);
  it('contains final dimensions', () => expect(html).toContain('ГОТОВЫЙ РАЗМЕР'));
  it('contains the material list', () => expect(html).toContain('Материал'));
  it('contains the cut sequence', () => expect(html).toContain('Порядок реза'));
  it('contains the panel diagram', () => expect(html).toContain('Схема панели'));
  it('contains risk warnings', () => expect(html).toContain('Предупреждения'));
  it('contains the dry-fit checklist', () => expect(html).toContain('Чек-лист сухой сборки'));
});

describe('public product interface', () => {
  const html = renderToStaticMarkup(<App />);

  it('leads with the interactive board workflow', () => {
    expect(html).toContain('Интерактивная 3D-модель торцевой доски');
    expect(html).toContain('Карта торца');
    expect(html).toContain('Пакет срезов');
  });

  it('contains all three Russian project sheets', () => {
    expect(html).toContain('Габаритный чертёж');
    expect(html).toContain('Закупка и распил');
    expect(html).toContain('Карта сборки');
  });

  it('uses Russian workshop units in visible output', () => {
    expect(html).toContain('мм');
    expect(html).toContain(' м');
    expect(html).toContain(' л');
  });
});
