import { MCPExecutor } from '../interfaces';
export type PkgManager = 'npm'|'pnpm'|'pip'|'maven'|'gradle'|'go'|'cargo'|'composer'|'dotnet'|'unknown';
export interface LanguageShare { name: string; pct: number; }
export interface WorkspaceFingerprint {
  /** Increment when discovery semantics change so an old on-disk scan is never trusted. */
  version: 2; roots: string[]; sourceDirs: string[];
  languages: LanguageShare[]; frameworks: string[];
  entryPoints: string[]; pkgManager: PkgManager;
  hasSpec: boolean; monorepo: boolean; scannedAt: string;
}
const FILE = '.alpaquitay/fingerprint.json';
const IGNORED = new Set(['node_modules','.venv','venv','__pycache__','target','dist','build','.git','.alpaquitay','vendor','bin','obj','.next']);
const MAX_SCAN_DIRECTORIES = 160;
const MAX_SCAN_DEPTH = 8;
const EXT: Record<string,string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', go: 'Go', rs: 'Rust', php: 'PHP', rb: 'Ruby',
  cs: 'C#', dart: 'Dart', c: 'C', h: 'C/C++', cc: 'C++', cpp: 'C++', cxx: 'C++', hpp: 'C++', hxx: 'C++',
  vue: 'Vue', svelte: 'Svelte', scala: 'Scala', sc: 'Scala', clj: 'Clojure', cljs: 'Clojure', cljc: 'Clojure',
  ex: 'Elixir', exs: 'Elixir', erl: 'Erlang', hrl: 'Erlang', hs: 'Haskell', lhs: 'Haskell', lua: 'Lua',
  pl: 'Perl/Prolog', pm: 'Perl', r: 'R', m: 'Objective-C/MATLAB', mm: 'Objective-C++', sql: 'SQL',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell', ps1: 'PowerShell', psm1: 'PowerShell', fs: 'F#', fsx: 'F#',
  vb: 'Visual Basic', swift: 'Swift', ml: 'OCaml', mli: 'OCaml', f: 'Fortran', f90: 'Fortran', f95: 'Fortran',
  s: 'Assembly', asm: 'Assembly', sol: 'Solidity', ipynb: 'Jupyter Notebook',
};
export const SOURCE_CODE_EXTENSIONS = [...Object.keys(EXT), 'C', 'H', 'R', 'S'];

type WorkspaceEntry = { name: string; isDirectory: boolean };

/**
 * Retain source roots, rather than incidental package folders.  A Java class at
 * `src/main/java/com/acme/App.java` belongs to `src/main/java`, not `com/acme`.
 */
function sourceRootFor(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const main = parts.findIndex((part, index) => part === 'src' && parts[index + 1] === 'main' && parts[index + 2] === 'java');
  if (main >= 0) { return parts.slice(0, main + 3).join('/'); }
  const test = parts.findIndex((part, index) => part === 'src' && parts[index + 1] === 'test' && parts[index + 2] === 'java');
  if (test >= 0) { return parts.slice(0, test + 3).join('/'); }
  const src = parts.lastIndexOf('src');
  if (src >= 0) { return parts.slice(0, src + 1).join('/'); }
  return path;
}

function sourceDirOrder(left: string, right: string): number {
  const rank = (path: string): number => {
    if (/\/src\/main\/java$/.test(`/${path}`)) { return 0; }
    if (/\/src\/test\/java$/.test(`/${path}`)) { return 2; }
    if (/(^|\/)test(s)?($|\/)/i.test(path)) { return 2; }
    return 1;
  };
  return rank(left) - rank(right) || left.localeCompare(right);
}
// Invariante Cap.09 Codigo Sintetico: NUNCA asumir src/. Todo sourceDir evidenciado.
// Uncle Bob: el framework es un detalle. Fowler: pasos pequenos y reversibles.
export class WorkspaceFingerprinter {
  private cached: WorkspaceFingerprint | null = null;
  private forceScan = false;
  constructor(private readonly mcp: MCPExecutor) {}
  async fingerprint(): Promise<WorkspaceFingerprint> {
    if (this.cached) { return this.cached; }
    if (!this.forceScan) {
      try {
        const f = await this.mcp.executeTool('filesystem','read_file',{ path: FILE }) as { content: string };
        const p = JSON.parse(f.content) as WorkspaceFingerprint;
        // Version 1 only inspected one directory level, which misses Maven's
        // `src/main/java` tree.  Force one fresh scan after upgrading.
        if (p?.version === 2 && Array.isArray(p.sourceDirs)) { this.cached = p; return p; }
      } catch { /* cold start */ }
    }
    const fp = await this.scan();
    this.cached = fp;
    this.forceScan = false;
    try { await this.mcp.executeTool('filesystem','write_file',{ path: FILE, content: JSON.stringify(fp,null,2) }); } catch { /* best-effort */ }
    return fp;
  }
  invalidate(): void { this.cached = null; this.forceScan = true; }
  async refresh(): Promise<WorkspaceFingerprint> { this.invalidate(); return this.fingerprint(); }
  private async scan(): Promise<WorkspaceFingerprint> {
    const fp: WorkspaceFingerprint = { version: 2, roots: ['.'], sourceDirs: [], languages: [], frameworks: [], entryPoints: [], pkgManager: 'unknown', hasSpec: false, monorepo: false, scannedAt: new Date().toISOString() };
    let top: WorkspaceEntry[] = [];
    try { top = await this.mcp.executeTool('filesystem','list_files',{ path: '.' }) as typeof top; } catch { return fp; }
    const names = new Set(top.map(e => e.name));
    const fw = (s: string) => { if (!fp.frameworks.includes(s)) { fp.frameworks.push(s); } };
    const ent = (s: string) => { if (!fp.entryPoints.includes(s)) { fp.entryPoints.push(s); } };
    if (names.has('angular.json')) { fw('Angular'); fp.pkgManager = 'npm'; }
    if (names.has('pnpm-workspace.yaml')) { fp.monorepo = true; }
    if (names.has('package.json')) { fw(await this.refineNode()); ent('package.json'); }
    if (names.has('pnpm-workspace.yaml') || names.has('pnpm-lock.yaml')) { fp.pkgManager = 'pnpm'; }
    else if (names.has('package.json')) { fp.pkgManager = 'npm'; }
    if (names.has('manage.py')) { fw('Django + DRF'); fp.pkgManager = 'pip'; ent('manage.py'); }
    else if (names.has('pyproject.toml') || names.has('requirements.txt')) { fw(await this.refinePy(names)); fp.pkgManager = 'pip'; }
    if (names.has('pom.xml')) { fw(await this.refineMaven()); fp.pkgManager = 'maven'; ent('pom.xml'); }
    if (names.has('build.gradle') || names.has('build.gradle.kts')) {
      const buildFile = names.has('build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle';
      fw(await this.refineGradle(buildFile)); fp.pkgManager = 'gradle'; ent(buildFile);
    }
    if (names.has('go.mod')) { fw('Go modules'); fp.pkgManager = 'go'; ent('go.mod'); }
    if (names.has('Cargo.toml')) { fw('Rust Cargo'); fp.pkgManager = 'cargo'; }
    if (names.has('composer.json')) { fw('PHP Composer'); fp.pkgManager = 'composer'; }
    for (const e of top) {
      if (!e.isDirectory && (e.name.endsWith('.csproj') || e.name.endsWith('.sln'))) { fw('.NET'); fp.pkgManager = 'dotnet'; ent(e.name); }
      if (!e.isDirectory && /^spec\.md$/i.test(e.name)) { fp.hasSpec = true; }
    }
    const counts = new Map<string,number>();
    const sourceDirs = new Set<string>();
    const queue = top
      .filter(entry => entry.isDirectory && !IGNORED.has(entry.name))
      .map(entry => ({ path: entry.name, depth: 1 }));
    let scanned = 0;
    while (queue.length > 0 && scanned < MAX_SCAN_DIRECTORIES) {
      const current = queue.shift()!;
      let entries: WorkspaceEntry[] = [];
      try { entries = await this.mcp.executeTool('filesystem', 'list_files', { path: current.path }) as WorkspaceEntry[]; } catch { continue; }
      scanned++;
      for (const entry of entries.slice(0, 120)) {
        if (entry.isDirectory) {
          if (current.depth < MAX_SCAN_DEPTH && !IGNORED.has(entry.name)) {
            queue.push({ path: `${current.path}/${entry.name}`, depth: current.depth + 1 });
          }
          continue;
        }
        const language = EXT[(entry.name.split('.').pop() ?? '').toLowerCase()];
        if (!language) { continue; }
        counts.set(language, (counts.get(language) ?? 0) + 1);
        sourceDirs.add(sourceRootFor(current.path));
      }
    }
    // The build file is evidence of Java even in a repository whose source tree
    // has not been created yet.  Do not let an empty Maven repo become TypeScript.
    if ((fp.pkgManager === 'maven' || fp.pkgManager === 'gradle') && !counts.has('Java')) {
      counts.set('Java', 1);
    }
    fp.sourceDirs = [...sourceDirs].sort(sourceDirOrder);
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
  private async refineMaven(): Promise<string> {
    try {
      const f = await this.mcp.executeTool('filesystem', 'read_file', { path: 'pom.xml' }) as { content: string };
      if (/spring-boot|org\.springframework/i.test(f.content)) { return 'Java + Spring Boot + Maven'; }
    } catch { /* marker is still enough to identify Maven */ }
    return 'Java + Maven';
  }
  private async refineGradle(path: string): Promise<string> {
    try {
      const f = await this.mcp.executeTool('filesystem', 'read_file', { path }) as { content: string };
      if (/spring-boot|org\.springframework/i.test(f.content)) { return 'Java + Spring Boot + Gradle'; }
    } catch { /* marker is still enough to identify Gradle */ }
    return 'Java + Gradle';
  }
}
