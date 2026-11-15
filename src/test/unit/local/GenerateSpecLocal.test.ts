import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ManifestSummary } from '../../../local/cdnPolicy';
import {
  buildSpecMessages, capabilityProblem, CLEAR_LOCAL_CACHE, extractSpecMarkdown, GENERATE_SPEC_LOCAL, registerLocalEngineCommands, requestLanguage, slugify,
  specSystemPrompt, titleOf,
} from '../../../local/GenerateSpecLocal';
import type { LocalEngineApi } from '../../../local/LocalEngineHost';
import { settings } from './fixtures';

const SPEC = `# Reservas de padel

Portal de reservas.

## Epic: Reservas

- [ ] SPEC-001 Crear reserva
- [ ] SPEC-002 Cancelar reserva
`;

const summary = (over: Partial<ManifestSummary> = {}): ManifestSummary => ({
  id: 'gemma-4-e2b-it', label: 'Gemma 4 E2B', revision: 'r1', license: 'apache-2.0', totalBytes: 1.5 * 1024 ** 3, requiresWebGpu: false, source: 'network', ...over,
});

describe('GenerateSpecLocal helpers', () => {
  it('extractSpecMarkdown strips fences, chatter and reasoning blocks', () => {
    expect(extractSpecMarkdown('Claro, aqui esta:\n\n```markdown\n' + SPEC + '```\n')).toBe(SPEC);
    expect(extractSpecMarkdown('<|channel>thought\npiensa<channel|>' + SPEC)).toBe(SPEC);
    expect(extractSpecMarkdown(SPEC)).toBe(SPEC);
  });
  it('requestLanguage tells Spanish from English (Spanish wins ties)', () => {
    expect(requestLanguage('Portal de reservas para un club de padel con pagos online')).toBe('es');
    expect(requestLanguage('Gestión de pistas')).toBe('es');                     // accents are decisive
    expect(requestLanguage('Booking portal for a padel club with online payments and reminders')).toBe('en');
    expect(requestLanguage('CRM')).toBe('es');
  });
  it('the system prompt names the language and shows an example in it', () => {
    const es = buildSpecMessages('Portal de reservas para un club de padel')[0].content;
    expect(es).toContain('in Spanish');
    expect(es).toContain('- [ ] SPEC-002 Implementar la búsqueda por título y autor');
    const en = buildSpecMessages('Booking portal for a padel club with payments')[0].content;
    expect(en).toContain('in English');
    expect(en).toContain('- [ ] SPEC-004 Integrate the payment gateway');
    expect(specSystemPrompt('es')).toMatch(/3 to 5 epics/);
  });
  it('extractSpecMarkdown normalises numbered or translated epic headings to "## Epic:"', () => {
    const raw = '# T\nC\n## Epic 1: Reservas\n- [ ] SPEC-001 A\n## Épica 2 - Pagos\n- [ ] SPEC-002 B\n## epica: Socios\n- [ ] SPEC-003 C\n## Epic: Ya bien\n';
    expect(extractSpecMarkdown(raw)).toBe('# T\nC\n## Epic: Reservas\n- [ ] SPEC-001 A\n## Epic: Pagos\n- [ ] SPEC-002 B\n## Epic: Socios\n- [ ] SPEC-003 C\n## Epic: Ya bien\n');
    expect(extractSpecMarkdown('# T\n## Epics overview\n')).toBe('# T\n## Epics overview\n');   // a different word is left alone
  });
  it('extractSpecMarkdown drops a last task cut off by the token limit, and only that', () => {
    expect(extractSpecMarkdown(SPEC + '- [ ] SPEC-0')).toBe(SPEC);
    expect(extractSpecMarkdown(SPEC + '- [ ] SPEC-')).toBe(SPEC);
    expect(extractSpecMarkdown(SPEC + '- [ ]')).toBe(SPEC);
    const complete = SPEC + '- [ ] SPEC-003 Pagar online\n';
    expect(extractSpecMarkdown(complete)).toBe(complete);
  });
  it('slugify is filesystem safe and accent free', () => {
    expect(slugify('Reservas de pádel & pagos!')).toBe('reservas-de-padel-pagos');
    expect(slugify('***')).toBe('spec-local');
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(48);
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
  });
  it('titleOf reads the first H1 or falls back', () => {
    expect(titleOf(SPEC, 'x')).toBe('Reservas de padel');
    expect(titleOf('sin titulo', 'respaldo')).toBe('respaldo');
  });
  it('buildSpecMessages pins the spec.md format', () => {
    const [sys, user] = buildSpecMessages('  portal de reservas  ');
    expect(sys.role).toBe('system');
    expect(sys.content).toContain('## Epic:');
    expect(sys.content).toContain('- [ ] SPEC-001');
    expect(user).toEqual({ role: 'user', content: 'portal de reservas' });
  });
});

describe('capabilityProblem (refuse BEFORE the download)', () => {
  const small = { totalBytes: 300 * 1024 ** 2 };
  it('blocks a WebGPU-only model on a machine without WebGPU', () => {
    expect(capabilityProblem(summary({ ...small, requiresWebGpu: true }), { webgpu: false })).toMatch(/necesita WebGPU/);
    expect(capabilityProblem(summary({ ...small, requiresWebGpu: true }), { webgpu: true })).toBeUndefined();
    expect(capabilityProblem(summary({ ...small, requiresWebGpu: false }), { webgpu: false })).toBeUndefined();
  });
  it('blocks a model too big for single-thread Wasm even when its manifest allows CPU (gemma-3-1b-it: 839 MB)', () => {
    const big = summary({ requiresWebGpu: false, totalBytes: 879_436_000 });
    expect(capabilityProblem(big, { webgpu: false })).toMatch(/necesita WebGPU/);
    expect(capabilityProblem(big, { webgpu: true })).toBeUndefined();
  });
  it('tells the user why WebGPU is missing', () => {
    const msg = capabilityProblem(summary(), { webgpu: false, gpuReason: 'VS Code esta en renderizado por software' });
    expect(msg).toContain('Motivo: VS Code esta en renderizado por software');
  });
  it('blocks when RAM is below what the model declares', () => {
    expect(capabilityProblem(summary({ minRamBytes: 8 * 1024 ** 3 }), { webgpu: true }, 4 * 1024 ** 3)).toMatch(/al menos 8\.00 GB.*4\.00 GB/);
    expect(capabilityProblem(summary({ minRamBytes: 8 * 1024 ** 3 }), { webgpu: true }, 16 * 1024 ** 3)).toBeUndefined();
  });
});

describe('alpaquitay-ai.generateSpecLocal command', () => {
  let root: string;
  let handlers: Record<string, () => Promise<void>>;
  let engine: jest.Mocked<LocalEngineApi>;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'alpaquitay-'));
    handlers = {};
    (vscode.commands.registerCommand as jest.Mock).mockImplementation((id: string, fn: () => Promise<void>) => { handlers[id] = fn; return { dispose: jest.fn() }; });
    engine = {
      probe: jest.fn().mockResolvedValue({ webgpu: true, shaderF16: true, cached: true, manifest: summary() }),
      generate: jest.fn().mockResolvedValue({ text: 'Claro:\n' + SPEC, device: 'webgpu', newTokens: 40 }),
      clearCache: jest.fn().mockResolvedValue({ files: 4, bytes: 3 * 1024 * 1024 }),
    } as jest.Mocked<LocalEngineApi>;
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('portal de reservas de padel');
    (vscode.workspace as { openTextDocument?: unknown }).openTextDocument = jest.fn().mockResolvedValue({});
    (vscode.window.showInformationMessage as jest.Mock).mockClear();
    (vscode.window.showErrorMessage as jest.Mock).mockClear();
    (vscode.window as { activeTextEditor: unknown }).activeTextEditor = undefined;
    registerLocalEngineCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext, engine, () => settings({ enabled: false }), root);
  });
  afterEach(() => fs.rm(root, { recursive: true, force: true }));

  it('registers both commands', () => expect(Object.keys(handlers).sort()).toEqual([CLEAR_LOCAL_CACHE, GENERATE_SPEC_LOCAL].sort()));

  it('generates, writes specs/<slug>.md in spec.md format and opens it (cached model: no download prompt)', async () => {
    await handlers[GENERATE_SPEC_LOCAL]();
    expect(await fs.readFile(path.join(root, 'specs', 'reservas-de-padel.md'), 'utf8')).toBe(SPEC);
    expect(engine.generate.mock.calls[0][1].messages[1].content).toBe('portal de reservas de padel');
    expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);  // only the final notice
    expect((vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0]).toMatch(/localmente \(GPU\)/);
  });

  it('never overwrites an existing spec', async () => {
    await handlers[GENERATE_SPEC_LOCAL]();
    await handlers[GENERATE_SPEC_LOCAL]();
    expect((await fs.readdir(path.join(root, 'specs'))).sort()).toEqual(['reservas-de-padel-2.md', 'reservas-de-padel.md']);
  });

  it('asks for confirmation (size and license from the VERIFIED manifest) and does nothing if declined', async () => {
    engine.probe.mockResolvedValue({ webgpu: true, shaderF16: true, cached: false, manifest: summary() });
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(undefined);
    await handlers[GENERATE_SPEC_LOCAL]();
    const [, opts] = (vscode.window.showInformationMessage as jest.Mock).mock.calls[0];
    expect(opts.modal).toBe(true);
    expect(opts.detail).toContain('1.50 GB');
    expect(opts.detail).toContain('apache-2.0');
    expect(opts.detail).toContain('manifiesto firmado');
    expect(engine.generate).not.toHaveBeenCalled();
    await expect(fs.access(path.join(root, 'specs'))).rejects.toBeTruthy();
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('warns in the dialog when only the offline copy of the manifest is available', async () => {
    engine.probe.mockResolvedValue({ webgpu: true, shaderF16: true, cached: false, manifest: summary({ source: 'offline-copy' }) });
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce(undefined);
    await handlers[GENERATE_SPEC_LOCAL]();
    expect((vscode.window.showInformationMessage as jest.Mock).mock.calls[0][1].detail).toContain('ultima copia verificada');
  });

  it('downloads after the user accepts (a model small enough for the CPU, with the CPU notice)', async () => {
    engine.probe.mockResolvedValue({ webgpu: false, shaderF16: false, cached: false, manifest: summary({ totalBytes: 300 * 1024 ** 2 }) });
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('Descargar y generar');
    await handlers[GENERATE_SPEC_LOCAL]();
    expect((vscode.window.showInformationMessage as jest.Mock).mock.calls[0][1].detail).toContain('Sin WebGPU');
    expect(engine.generate).toHaveBeenCalledTimes(1);
  });

  it('refuses a model too big for the CPU when WebGPU is missing, and passes on the reason', async () => {
    engine.probe.mockResolvedValue({ webgpu: false, shaderF16: false, cached: true, manifest: summary(), gpuReason: 'VS Code esta en renderizado por software' });
    await handlers[GENERATE_SPEC_LOCAL]();
    const msg = (vscode.window.showErrorMessage as jest.Mock).mock.calls[0][0] as string;
    expect(msg).toContain('necesita WebGPU');
    expect(msg).toContain('renderizado por software');
    expect(engine.generate).not.toHaveBeenCalled();
  });

  it('refuses a WebGPU-only model on a machine without WebGPU BEFORE asking to download gigabytes', async () => {
    engine.probe.mockResolvedValue({ webgpu: false, shaderF16: false, cached: false, manifest: summary({ requiresWebGpu: true }) });
    await handlers[GENERATE_SPEC_LOCAL]();
    expect((vscode.window.showErrorMessage as jest.Mock).mock.calls[0][0]).toContain('necesita WebGPU');
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();   // no download dialog
    expect(engine.generate).not.toHaveBeenCalled();
  });

  it('rejects an oversized selection before any engine work', async () => {
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('x'.repeat(20_000));
    await handlers[GENERATE_SPEC_LOCAL]();
    expect((vscode.window.showErrorMessage as jest.Mock).mock.calls[0][0]).toContain('demasiado largo');
    expect(engine.probe).not.toHaveBeenCalled();
  });

  it('shows an actionable error when the engine fails', async () => {
    engine.generate.mockRejectedValue(new Error('WebGPU no esta disponible'));
    await handlers[GENERATE_SPEC_LOCAL]();
    expect((vscode.window.showErrorMessage as jest.Mock).mock.calls[0][0]).toContain('WebGPU no esta disponible');
  });

  it('does nothing when the prompt is dismissed', async () => {
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);
    await handlers[GENERATE_SPEC_LOCAL]();
    expect(engine.probe).not.toHaveBeenCalled();
  });

  it('clear cache reports what was freed', async () => {
    await handlers[CLEAR_LOCAL_CACHE]();
    expect((vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0]).toContain('4 archivos, 3 MB');
  });
});
