import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CursorIntegration } from '../../../integrations/editors/CursorIntegration';
import { WindsurfIntegration } from '../../../integrations/editors/WindsurfIntegration';
import { ArchitectureRules } from '../../../integrations/interfaces';
import { SecretVault } from '../../../secrets/SecretVault';

function mockVault(): SecretVault {
  return {
    get: jest.fn().mockResolvedValue(undefined), set: jest.fn(),
    delete: jest.fn(), has: jest.fn().mockResolvedValue(true),
    getAll: jest.fn().mockResolvedValue({}), child: jest.fn(),
  } as never;
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'alpaquitay-test-'));
}

const JAVA_RULES: ArchitectureRules = {
  style: 'layered',
  language: 'Java',
  framework: 'Spring Boot',
  layers: ['controller', 'service', 'repository', 'entity'],
  conventions: ['Use @Valid on controller params', 'Services return DTOs not entities'],
  forbiddenPatterns: ['@Autowired on fields', 'God classes'],
};

// ── CursorIntegration ─────────────────────────────────────────────────────────

describe('CursorIntegration', () => {
  let integration: CursorIntegration;

  beforeEach(async () => {
    integration = new CursorIntegration();
    await integration.initialize(mockVault());
  });

  it('writeRules creates .cursor/rules with layer info', async () => {
    const dir = tempDir();
    await integration.writeRules(dir, JAVA_RULES);
    const content = fs.readFileSync(path.join(dir, '.cursor', 'rules'), 'utf8');
    expect(content).toContain('layered');
    expect(content).toContain('Java');
    expect(content).toContain('Spring Boot');
    expect(content).toContain('controller');
  });

  it('readContext returns empty when no rules file exists', async () => {
    const dir = tempDir();
    const ctx = await integration.readContext(dir);
    expect(ctx).toEqual({});
  });

  it('readContext parses a written rules file', async () => {
    const dir = tempDir();
    await integration.writeRules(dir, JAVA_RULES);
    const ctx = await integration.readContext(dir);
    expect(ctx.rules?.language).toBe('Java');
    expect(ctx.rules?.style).toBe('layered');
  });

  it('buildPromptContext includes layer boundaries', async () => {
    const dir = tempDir();
    await integration.writeRules(dir, JAVA_RULES);
    const ctx = await integration.readContext(dir);
    const prompt = integration.buildPromptContext(ctx);
    expect(prompt).toContain('controller');
  });

  it('buildPromptContext returns empty string for empty context', () => {
    expect(integration.buildPromptContext({})).toBe('');
  });

  it('writes SOLID footer to rules file', async () => {
    const dir = tempDir();
    await integration.writeRules(dir, JAVA_RULES);
    const content = fs.readFileSync(path.join(dir, '.cursor', 'rules'), 'utf8');
    expect(content).toContain('SOLID');
    expect(content).toContain('Single Responsibility');
  });
});

// ── WindsurfIntegration ───────────────────────────────────────────────────────

describe('WindsurfIntegration', () => {
  let integration: WindsurfIntegration;

  beforeEach(async () => {
    integration = new WindsurfIntegration();
    await integration.initialize(mockVault());
  });

  it('writeRules creates .windsurfrules', async () => {
    const dir = tempDir();
    await integration.writeRules(dir, JAVA_RULES);
    expect(fs.existsSync(path.join(dir, '.windsurfrules'))).toBe(true);
  });

  it('written file contains architecture rules', async () => {
    const dir = tempDir();
    await integration.writeRules(dir, JAVA_RULES);
    const content = fs.readFileSync(path.join(dir, '.windsurfrules'), 'utf8');
    expect(content).toContain('layered');
    expect(content).toContain('Spring Boot');
  });

  it('readContext returns empty when no file exists', async () => {
    const dir = tempDir();
    expect(await integration.readContext(dir)).toEqual({});
  });

  it('readContext parses language from written file', async () => {
    const dir = tempDir();
    await integration.writeRules(dir, JAVA_RULES);
    const ctx = await integration.readContext(dir);
    expect(ctx.rules?.language).toBe('Java');
  });

  it('mergeRules preserves existing user content when block markers absent', async () => {
    const dir = tempDir();
    const existing = '# My existing rules\n\nDo not use singletons.';
    fs.writeFileSync(path.join(dir, '.windsurfrules'), existing, 'utf8');
    await integration.writeRules(dir, JAVA_RULES);
    const content = fs.readFileSync(path.join(dir, '.windsurfrules'), 'utf8');
    expect(content).toContain('My existing rules');
    expect(content).toContain('alpaquitay:start');
  });

  it('buildPromptContext includes "Senior Architect" header', async () => {
    const ctx = { rules: JAVA_RULES };
    const prompt = integration.buildPromptContext(ctx);
    expect(prompt).toContain('Senior Architect');
    expect(prompt).toContain('controller');
  });
});
