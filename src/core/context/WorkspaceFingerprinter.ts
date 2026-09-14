import { MCPExecutor } from '../interfaces';
export type PkgManager = 'npm'|'pnpm'|'pip'|'maven'|'gradle'|'go'|'cargo'|'composer'|'dotnet'|'unknown';
export interface LanguageShare { name: string; pct: number; }
export interface WorkspaceFingerprint {
  version: 1; roots: string[]; sourceDirs: string[];
  languages: LanguageShare[]; frameworks: string[];
  entryPoints: string[]; pkgManager: PkgManager;
  hasSpec: boolean; monorepo: boolean; scannedAt: string;
}
const FILE = '.alpaquitay/fingerprint.json';
const IGNORED = new Set(['node_modules','.venv','venv','__pycache__','target','dist','build','.git','.alpaquitay','vendor','bin','obj','.next']);
const EXT: Record<string,string> = { ts:'TypeScript',tsx:'TypeScript',js:'JavaScript',jsx:'JavaScript',py:'Python',java:'Java',kt:'Kotlin',go:'Go',rs:'Rust',php:'PHP',rb:'Ruby',cs:'C#',dart:'Dart' };
// Invariante Cap.09 Codigo Sintetico: NUNCA asumir src/. Todo sourceDir evidenciado.
// Uncle Bob: el framework es un detalle. Fowler: pasos pequenos y reversibles.
export class WorkspaceFingerprinter {
  private cached: WorkspaceFingerprint | null = null;
  constructor(private readonly mcp: MCPExecutor) {}
  async fingerprint(): Promise<WorkspaceFingerprint> {
    if (this.cached) { return this.cached; }
    try {
      const f = await this.mcp.executeTool('filesystem','read_file',{ path: FILE }) as { content: string };
      const p = JSON.parse(f.content) as WorkspaceFingerprint;
      if (p?.version === 1 && Array.isArray(p.sourceDirs)) { this.cached = p; return p; }
    } catch { /* cold start */ }
    const fp = await this.scan();
    this.cached = fp;
    try { await this.mcp.executeTool('filesystem','write_file',{ path: FILE, content: JSON.stringify(fp,null,2) }); } catch { /* best-effort */ }
    return fp;
  }
  invalidate(): void { this.cached = null; }
  private async scan(): Promise<WorkspaceFingerprint> {
    const fp: WorkspaceFingerprint = { version: 1, roots: ['.'], sourceDirs: [], languages: [], frameworks: [], entryPoints: [], pkgManager: 'unknown', hasSpec: false, monorepo: false, scannedAt: new Date().toISOString() };
    let top: Array<{ name: string; isDirectory: boolean }> = [];
    try { top = await this.mcp.executeTool('filesystem','list_files',{ path: '.' }) as typeof top; } catch { return fp; }
    const names = new Set(top.map(e => e.name));
    const fw = (s: string) => { if (!fp.frameworks.includes(s)) { fp.frameworks.push(s); } };
    const ent = (s: string) => { if (!fp.entryPoints.includes(s)) { fp.entryPoints.push(s); } };
    if (names.has('angular.json')) { fw('Angular'); fp.pkgManager = 'npm'; }
    if (names.has('pnpm-workspace.yaml')) { fp.monorepo = true; fp.pkgManager = 'pnpm'; }
    if (names.has('package.json')) { fp.pkgManager = 'npm'; fw(await this.refineNode()); ent('package.json'); }
    if (names.has('manage.py')) { fw('Django + DRF'); fp.pkgManager = 'pip'; ent('manage.py'); }
    else if (names.has('pyproject.toml') || names.has('requirements.txt')) { fw(await this.refinePy(names)); fp.pkgManager = 'pip'; }
    if (names.has('pom.xml')) { fw('Java + Maven'); fp.pkgManager = 'maven'; ent('pom.xml'); }
    if (names.has('build.gradle') || names.has('build.gradle.kts')) { fw('Spring Boot'); fp.pkgManager = 'gradle'; }
    if (names.has('go.mod')) { fw('Go modules'); fp.pkgManager = 'go'; ent('go.mod'); }
    if (names.has('Cargo.toml')) { fw('Rust Cargo'); fp.pkgManager = 'cargo'; }
    if (names.has('composer.json')) { fw('PHP Composer'); fp.pkgManager = 'composer'; }
    for (const e of top) {
      if (!e.isDirectory && (e.name.endsWith('.csproj') || e.name.endsWith('.sln'))) { fw('.NET'); fp.pkgManager = 'dotnet'; ent(e.name); }
      if (!e.isDirectory && /^spec\.md$/i.test(e.name)) { fp.hasSpec = true; }
    }
    const counts = new Map<string,number>();
    for (const e of top) {
      if (!e.isDirectory || IGNORED.has(e.name)) { continue; }
      let sub: Array<{ name: string; isDirectory: boolean }> = [];
      try { sub = await this.mcp.executeTool('filesystem','list_files',{ path: e.name }) as typeof sub; } catch { continue; }
      let code = 0;
      for (const f of sub.slice(0,40)) {
        if (f.isDirectory) { continue; }
        const lang = EXT[(f.name.split('.').pop() ?? '').toLowerCase()];
        if (lang) { code++; counts.set(lang,(counts.get(lang) ?? 0)+1); }
      }
      if (code >= 1) { fp.sourceDirs.push(e.name); }
    }
    const total = [...counts.values()].reduce((a,b) => a+b, 0) || 1;
    fp.languages = [...counts.entries()].map(([name,n]) => ({ name, pct: Math.round(n/total*100) })).sort((a,b) => b.pct-a.pct).slice(0,4);
    if (fp.sourceDirs.length === 0 && top.length > 0) { fp.sourceDirs = ['.']; }
    if (fp.frameworks.length === 0 && fp.languages.length > 0) { fp.frameworks = [fp.languages[0].name + ' (detectado)']; }
    return fp;
  }
  private async refineNode(): Promise<string> {
    try {
      const f = await this.mcp.executeTool('filesystem','read_file',{ path: 'package.json' }) as { content: string };
      const pkg = JSON.parse(f.content) as { dependencies?: Record<string,string>; devDependencies?: Record<string,string> };
      const d = { ...pkg.dependencies, ...pkg.devDependencies }; const has = (k: string) => k in d;
      if (has('next')) { return 'Next.js'; }
      if (has('react-native') || has('expo')) { return 'React Native + Expo'; }
      if (has('react') && (has('express') || has('fastify'))) { return 'React + Node/Express'; }
      if (has('react')) { return 'React + Vite'; }
      if (has('vue')) { return 'Vue 3 + Vite'; }
      if (has('express') || has('fastify') || has('koa')) { return 'Node/Express API'; }
    } catch { /* default */ }
    return 'Node';
  }
  private async refinePy(names: Set<string>): Promise<string> {
    for (const f of ['requirements.txt','pyproject.toml']) {
      if (!names.has(f)) { continue; }
      try {
        const r = await this.mcp.executeTool('filesystem','read_file',{ path: f }) as { content: string };
        const l = r.content.toLowerCase();
        if (l.includes('django')) { return 'Django + DRF'; }
        if (l.includes('flask')) { return 'Flask + SQLAlchemy'; }
        if (l.includes('fastapi')) { return 'FastAPI'; }
      } catch { /* next */ }
    }
    return 'Python';
  }
}
