import { MCPExecutor } from './interfaces';
import {
  ArchitecturalStyle,
  ProjectContext,
  getMasterPrompt,
  getChatSystemPrompt
} from '../prompts/MasterPrompts';
import { detectStyleFromGoal } from '../prompts/ProjectTemplates';

// ── Detection helpers ─────────────────────────────────────────────────────────

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function detectStyleFromEslint(raw: string): string {
  if (raw.includes('airbnb')) { return 'Airbnb JS Style Guide'; }
  if (raw.includes('google')) { return 'Google JS Style Guide'; }
  if (raw.includes('standard')) { return 'StandardJS'; }
  if (raw.includes('prettier')) { return 'Prettier'; }
  return 'project conventions';
}

function detectFromPackage(pkg: PackageJson): { style: ArchitecturalStyle; language: string; framework: string } {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const has = (name: string) => name in deps;

  const isTS = has('typescript');
  const language = isTS ? 'TypeScript' : 'JavaScript';

  if (detectPackageAngular(pkg))                                   { return { style: 'angular',      language, framework: 'Angular' }; }
  if (has('react-native') || has('expo'))                          { return { style: 'react-native', language, framework: 'React Native + Expo' }; }
  if (has('next'))                                                  { return { style: 'nextjs',       language, framework: 'Next.js' }; }
  if (has('react') && (has('express') || has('koa') || has('fastify'))) { return { style: 'react-node',  language, framework: 'React + Node.js/Express' }; }
  if (has('react'))                                                 { return { style: 'react-spa',    language, framework: 'React + Vite' }; }
  if (has('vue'))                                                   { return { style: 'vue-spa',      language, framework: 'Vue 3 + Vite' }; }
  if (has('express') || has('koa') || has('fastify') || has('hapi')) { return { style: 'express-api', language, framework: 'Node.js/Express API' }; }
  return { style: 'generic', language, framework: 'Node.js' };
}

function detectFromRequirements(content: string): { style: ArchitecturalStyle; language: string; framework: string } {
  const has = (name: string) => content.toLowerCase().includes(name);
  if (has('django')) { return { style: 'django',          language: 'Python', framework: 'Django + DRF' }; }
  if (has('flask'))  { return { style: 'flask',           language: 'Python', framework: 'Flask + SQLAlchemy' }; }
  return { style: 'generic', language: 'Python', framework: 'Python' };
}

function detectFromPom(content: string): { style: ArchitecturalStyle; language: string; framework: string } {
  const hasSpring = content.includes('spring-boot') || content.includes('spring-web');
  const framework = hasSpring ? 'Java + Maven (Clean Architecture)' : 'Java Maven';
  return { style: 'java-maven', language: 'Java', framework };
}

function detectFromGradle(content: string): { style: ArchitecturalStyle; language: string; framework: string } {
  const hasSpring = content.includes('spring-boot') || content.includes('org.springframework');
  return { style: 'java-gradle', language: 'Java', framework: hasSpring ? 'Java + Spring Boot (Gradle)' : 'Java + Gradle' };
}

function detectFromAngularJson(): { style: ArchitecturalStyle; language: string; framework: string } {
  return { style: 'angular', language: 'TypeScript', framework: 'Angular' };
}

function detectFromGoMod(content: string): { style: ArchitecturalStyle; language: string; framework: string } {
  const gin = content.includes('gin-gonic/gin');
  return { style: 'go-api', language: 'Go', framework: gin ? 'Go + Gin' : 'Go + net/http' };
}

function detectFromCsproj(content: string): { style: ArchitecturalStyle; language: string; framework: string } {
  const isWebApi = content.includes('Microsoft.AspNetCore') || content.includes('Web');
  return { style: 'csharp-webapi', language: 'C#', framework: isWebApi ? 'ASP.NET Core Web API' : '.NET' };
}

function detectFromPyproject(content: string): { style: ArchitecturalStyle; language: string; framework: string } {
  const has = (name: string) => content.toLowerCase().includes(name);
  if (has('django')) { return { style: 'django',          language: 'Python', framework: 'Django' }; }
  if (has('flask'))  { return { style: 'flask',           language: 'Python', framework: 'Flask' }; }
  return { style: 'python-package', language: 'Python', framework: 'Python Package' };
}

function detectPackageAngular(pkg: PackageJson): boolean {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return '@angular/core' in deps || '@angular/cli' in deps;
}

// ── ProjectContextBuilder ─────────────────────────────────────────────────────

export class ProjectContextBuilder {
  private cached: ProjectContext | null = null;

  constructor(
    private readonly workspaceRoot: string,
    private readonly mcp: MCPExecutor
  ) {}

  /** Detect stack and return ProjectContext. Result is cached for the session. */
  async build(forceRefresh = false): Promise<ProjectContext> {
    if (this.cached && !forceRefresh) { return this.cached; }

    const structure = await this._readStructure();
    const { style, language, framework } = await this._detectStack();
    const styleGuide = await this._detectStyleGuide(language);
    const customRules = await this._readCustomRules();

    this.cached = { style, language, framework, styleGuide, structure, customRules };
    return this.cached;
  }

  /**
   * Build context starting from a free-text goal.
   * Used by ProjectBuilderSkill for new projects where no files exist yet.
   */
  async buildFromGoal(goal: string, overrideStyle?: ArchitecturalStyle): Promise<ProjectContext> {
    const structure = await this._readStructure();
    let { style, language, framework } = await this._detectStack();

    // Override from explicit parameter or from goal text
    const goalStyle = overrideStyle ?? detectStyleFromGoal(goal);
    if (goalStyle) {
      const map: Record<ArchitecturalStyle, { language: string; framework: string }> = {
        'java-maven':        { language: 'Java',        framework: 'Java + Maven (Clean Architecture)' },
        'java-gradle':       { language: 'Java',        framework: 'Java + Spring Boot Gradle (Clean Architecture)' },
        'spring-fullstack':  { language: 'Java',        framework: 'Spring Boot + React Microfrontend' },
        'python-package':    { language: 'Python',      framework: 'Python Package' },
        'angular':           { language: 'TypeScript',  framework: 'Angular' },
        'csharp-webapi':     { language: 'C#',          framework: 'ASP.NET Core Web API' },
        'go-api':            { language: 'Go',          framework: 'Go REST API' },
        'react-spa':         { language: 'TypeScript',  framework: 'React + Vite' },
        'react-clean':       { language: 'TypeScript',  framework: 'React + Vite (Clean Architecture)' },
        'react-node':        { language: 'TypeScript',  framework: 'React + Node.js/Express' },
        'nextjs':            { language: 'TypeScript',  framework: 'Next.js' },
        'vue-spa':           { language: 'TypeScript',  framework: 'Vue 3 + Vite' },
        'django':            { language: 'Python',      framework: 'Django + DRF' },
        'flask':             { language: 'Python',      framework: 'Flask + SQLAlchemy' },
        'express-api':       { language: 'JavaScript',  framework: 'Node.js/Express API' },
        'react-native':      { language: 'TypeScript',  framework: 'React Native + Expo' },
        'generic':           { language: 'TypeScript',  framework: 'Generic' },
      };
      style = goalStyle;
      ({ language, framework } = map[goalStyle]);
    }

    const styleGuide = await this._detectStyleGuide(language);
    const customRules = await this._readCustomRules();
    const ctx: ProjectContext = { style, language, framework, styleGuide, structure, customRules };
    this.cached = ctx;
    return ctx;
  }

  /** System prompt for general chat — concise but stack-aware. */
  async getChatSystemPrompt(): Promise<string> {
    const ctx = await this.build();
    return getChatSystemPrompt(ctx);
  }

  /** Full master prompt for code generation — used in task work and ProjectBuilderSkill. */
  async getMasterPrompt(smallModel = false): Promise<string> {
    const ctx = await this.build();
    return getMasterPrompt(ctx, smallModel);
  }

  /** Invalidate cache when user switches workspace. */
  invalidate(): void {
    this.cached = null;
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async _readStructure(): Promise<string> {
    try {
      const entries = await this.mcp.executeTool('filesystem', 'list_files', { path: '.' }) as
        Array<{ name: string; isDirectory: boolean }>;
      return entries.slice(0, 30).map(e => `${e.isDirectory ? 'd' : 'f'} ${e.name}`).join('\n');
    } catch { return '(structure unavailable)'; }
  }

  private async _detectStack(): Promise<{ style: ArchitecturalStyle; language: string; framework: string }> {
    // 1. Angular (angular.json wins over package.json for clearer signal)
    try {
      await this.mcp.executeTool('filesystem', 'read_file', { path: 'angular.json' });
      return detectFromAngularJson();
    } catch { /* not Angular */ }

    // 2. package.json (Node/JS ecosystem)
    try {
      const file = await this.mcp.executeTool('filesystem', 'read_file', { path: 'package.json' }) as { content: string };
      const pkg: PackageJson = JSON.parse(file.content);
      return detectFromPackage(pkg);
    } catch { /* not a Node project */ }

    // 3. Java Maven
    try {
      const file = await this.mcp.executeTool('filesystem', 'read_file', { path: 'pom.xml' }) as { content: string };
      return detectFromPom(file.content);
    } catch { /* not Maven */ }

    // 4. Java Gradle
    try {
      const file = await this.mcp.executeTool('filesystem', 'read_file', { path: 'build.gradle' }) as { content: string };
      return detectFromGradle(file.content);
    } catch { /* not Gradle */ }

    // 5. Go
    try {
      const file = await this.mcp.executeTool('filesystem', 'read_file', { path: 'go.mod' }) as { content: string };
      return detectFromGoMod(file.content);
    } catch { /* not Go */ }

    // 6. C# — look for any .csproj by listing root files
    try {
      const entries = await this.mcp.executeTool('filesystem', 'list_files', { path: '.' }) as Array<{ name: string }>;
      const csproj = entries.find(e => e.name.endsWith('.csproj'));
      if (csproj) {
        const file = await this.mcp.executeTool('filesystem', 'read_file', { path: csproj.name }) as { content: string };
        return detectFromCsproj(file.content);
      }
    } catch { /* not C# */ }

    // 7. Python — pyproject.toml
    try {
      const file = await this.mcp.executeTool('filesystem', 'read_file', { path: 'pyproject.toml' }) as { content: string };
      return detectFromPyproject(file.content);
    } catch { /* not found */ }

    // 8. Python — requirements.txt
    try {
      const file = await this.mcp.executeTool('filesystem', 'read_file', { path: 'requirements.txt' }) as { content: string };
      return detectFromRequirements(file.content);
    } catch { /* not found */ }

    return { style: 'generic', language: 'TypeScript', framework: 'unknown' };
  }

  private async _detectStyleGuide(language = 'JavaScript'): Promise<string> {
    // Language-specific defaults
    if (language === 'Java')   { return 'Google Java Style Guide'; }
    if (language === 'Go')     { return 'Effective Go + gofmt'; }
    if (language === 'C#')     { return 'Microsoft C# Coding Conventions'; }
    if (language === 'Python') {
      try {
        // Check for Black or Ruff in pyproject.toml
        const file = await this.mcp.executeTool('filesystem', 'read_file', { path: 'pyproject.toml' }) as { content: string };
        if (file.content.includes('[tool.black]') || file.content.includes('[tool.ruff]')) {
          return 'PEP 8 + Black';
        }
      } catch { /* ok */ }
      return 'PEP 8';
    }

    const candidates = ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs'];
    for (const f of candidates) {
      try {
        const file = await this.mcp.executeTool('filesystem', 'read_file', { path: f }) as { content: string };
        return detectStyleFromEslint(file.content);
      } catch { /* try next */ }
    }
    return 'project conventions';
  }

  private async _readCustomRules(): Promise<string | undefined> {
    // Pull first 5 lines of spec.md as project-level context (the "why")
    try {
      const file = await this.mcp.executeTool('filesystem', 'read_file', { path: 'spec.md' }) as { content: string };
      const header = file.content.split('\n').slice(0, 5).join(' ').replace(/#+/g, '').trim();
      return header || undefined;
    } catch { return undefined; }
  }
}
