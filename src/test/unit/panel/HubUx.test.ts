import * as fs from 'fs';
import * as path from 'path';
import { MainPanel } from '../../../panel/MainPanel';
import {
  HUX_CSS, HUX_FLOW_HTML, HUX_JS, HUX_NEXT_JS, HUX_OVERLAY_HTML, HUX_QUICK_HTML,
} from '../../../panel/HubUx';

type Step = {
  step: number; id: string; tone: string; title: string; hint: string; taskId?: string;
  cta: { label: string; act: string; needsIdle?: boolean } | null;
  sec: { label: string; act: string; needsIdle?: boolean } | null;
};
type State = { spec: unknown; harness: unknown; thinking?: boolean };

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const nextStep = new Function(`${HUX_NEXT_JS}; return huxNextStep;`)() as (s: State, w: Iterable<string>) => Step;

const task = (id: string, status: string, extra: Record<string, unknown> = {}) =>
  ({ id, title: `Title ${id}`, epicTitle: 'Epic A', status, done: status === 'done', ...extra });
const specOf = (...tasks: unknown[]) => ({ exists: true, tasks });
const harness = (pending = 0, score = 0, ceiling = 100) => ({
  pending: Array.from({ length: pending }, (_, i) => ({ path: `f${i}.ts` })),
  debt: { score, ceiling },
});

describe('HubUx next-step decision', () => {
  it('waits while the spec is still loading', () => {
    const r = nextStep({ spec: null, harness: null }, []);
    expect(r.id).toBe('loading');
    expect(r.cta).toBeNull();
  });

  it('asks for a spec when none exists, and offers the AI path', () => {
    const r = nextStep({ spec: { exists: false, tasks: [] }, harness: harness() }, []);
    expect(r.step).toBe(0);
    expect(r.cta?.act).toBe('regen');
    expect(r.title).toBe('Start with a spec');
  });

  it('treats an existing spec without tasks as step 1, not as done', () => {
    const r = nextStep({ spec: specOf(), harness: harness() }, []);
    expect(r.step).toBe(0);
    expect(r.title).toBe('Your spec has no tasks yet');
  });

  it('prefers todo over backlog and starts it with one click', () => {
    const r = nextStep({ spec: specOf(task('T-1', 'backlog'), task('T-2', 'todo')), harness: harness() }, []);
    expect(r.id).toBe('build');
    expect(r.taskId).toBe('T-2');
    expect(r.cta).toEqual({ label: 'Start T-2', act: 'start:T-2', needsIdle: true });
    expect(r.hint).toContain('2 of 2 tasks left');
  });

  it('offers Resume for a task already in progress', () => {
    const r = nextStep({ spec: specOf(task('T-1', 'in-progress')), harness: harness() }, []);
    expect(r.cta?.label).toBe('Resume T-1');
  });

  it('shows progress while the AI is working, without a competing primary action', () => {
    const r = nextStep({ spec: specOf(task('T-1', 'in-progress')), harness: harness() }, new Set(['T-1']));
    expect(r.id).toBe('building');
    expect(r.tone).toBe('busy');
    expect(r.cta?.act).toBe('tab:changes');
    expect(r.title).toContain('T-1');
  });

  it('puts review before new work and exposes apply as the secondary action', () => {
    const r = nextStep({ spec: specOf(task('T-1', 'todo')), harness: harness(2) }, []);
    expect(r.step).toBe(2);
    expect(r.tone).toBe('warn');
    expect(r.title).toBe('Review 2 pending changes');
    expect(r.sec).toEqual({ label: 'Apply & run gates', act: 'apply', needsIdle: true });
  });

  it('uses singular wording for one pending change', () => {
    const r = nextStep({ spec: specOf(task('T-1', 'todo')), harness: harness(1) }, []);
    expect(r.title).toBe('Review 1 pending change');
  });

  it('puts pending changes ahead of spec creation when no tasks exist', () => {
    const r = nextStep({ spec: { exists: false, tasks: [] }, harness: harness(1) }, []);
    expect(r.id).toBe('review');
    expect(r.cta?.act).toBe('tab:changes');
    expect(r.sec?.act).toBe('apply');
  });

  it('blocks new work when debt reaches the ceiling, and points to the evidence tab', () => {
    const r = nextStep({ spec: specOf(task('T-1', 'todo')), harness: harness(0, 100, 100) }, []);
    expect(r.id).toBe('blocked');
    expect(r.cta?.act).toBe('tab:git');
  });

  it('does not block below the ceiling', () => {
    const r = nextStep({ spec: specOf(task('T-1', 'todo')), harness: harness(0, 99, 100) }, []);
    expect(r.id).toBe('build');
  });

  it('moves to verify when every task is done', () => {
    const r = nextStep({ spec: specOf(task('T-1', 'done'), task('T-2', 'done')), harness: harness() }, []);
    expect(r.step).toBe(3);
    expect(r.cta?.act).toBe('skill:validate-against-spec');
    expect(r.sec?.act).toBe('tab:git');
  });

  it('survives malformed harness data', () => {
    const r = nextStep({ spec: specOf(task('T-1', 'todo')), harness: { pending: 'x', debt: null } }, []);
    expect(r.id).toBe('build');
  });
});

describe('HubUx module safety', () => {
  it('has no backticks or template placeholders inside strings injected verbatim into the webview', () => {
    for (const block of [HUX_CSS, HUX_JS, HUX_NEXT_JS, HUX_FLOW_HTML, HUX_QUICK_HTML, HUX_OVERLAY_HTML]) {
      expect(block).not.toContain('`');
      expect(block).not.toContain('${');
    }
  });

  it('is a syntactically valid script', () => {
    expect(() => new Function(HUX_JS)).not.toThrow();
  });
});

describe('HubUx wiring in MainPanel', () => {
  const panel = Object.create(MainPanel.prototype) as unknown as { _htmlBody(): string; _htmlScript(): string };

  it('injects the flow bar, quick actions and palette into the body', () => {
    const body: string = panel._htmlBody();
    expect(body).toContain('id="huxFlow"');
    expect(body).toContain('id="huxQuick"');
    expect(body).toContain('id="huxPal"');
    // Existing structure must be untouched
    for (const tab of ['studio', 'docs', 'git', 'arch', 'skills', 'changes', 'settings']) {
      expect(body).toContain(`data-tab="${tab}"`);
    }
    expect(body).toContain('id="harnessStrip"');
    expect(body).toContain('id="chatInput"');
  });

  it('places the quick actions inside the chat bar, above the input row', () => {
    const body: string = panel._htmlBody();
    const quick = body.indexOf('id="huxQuick"');
    expect(quick).toBeGreaterThan(body.indexOf('id="skillPicker"'));
    expect(quick).toBeLessThan(body.indexOf('class="input-row"'));
  });

  it('keeps the full webview script valid and adds Start / Review buttons to board cards', () => {
    const script: string = panel._htmlScript();
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain('function huxNextStep');
    expect(script).toContain('data-start-task');
    expect(script).toContain('data-review-task');
    expect(script).toContain("case 'agent-file-change'");
  });

  it('every message type the new UI posts is handled by the extension', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../panel/MainPanel.ts'), 'utf8');
    for (const type of ['update-task-status', 'run-skill', 'load-spec', 'load-harness', 'load-git', 'configure-provider']) {
      expect(src).toContain(`case '${type}'`);
    }
  });
});
