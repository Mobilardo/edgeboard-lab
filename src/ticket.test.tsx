import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MakerTicket } from './App';
import { createBoardPlan } from './core/index';

const plan = createBoardPlan(
  { length: 460, width: 310, thickness: 42 },
  { sawKerf: 3.2, maxClampWidth: 380, stockLength: 1000, minStripWidth: 28, machineWidth: 330 },
  { seed: 'ticket', family: 'woven-bands', complexity: 5, riskTolerance: 'balanced', speciesCount: 3 },
);

describe('maker ticket', () => {
  const html = renderToStaticMarkup(<MakerTicket plan={plan} />);
  it('contains final dimensions', () => expect(html).toContain('FINAL DIMENSIONS'));
  it('contains the material list', () => expect(html).toContain('Material list'));
  it('contains the cut sequence', () => expect(html).toContain('Cut sequence'));
  it('contains the panel diagram', () => expect(html).toContain('Panel diagram'));
  it('contains risk warnings', () => expect(html).toContain('Risk warnings'));
  it('contains the dry-fit checklist', () => expect(html).toContain('Dry-fit checklist'));
});
