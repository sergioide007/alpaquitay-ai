import { ArchitecturalStyle } from './MasterPrompts';

// ── Template types ────────────────────────────────────────────────────────────

export interface TemplateFile {
  /** Relative path from project root. Supports {{projectName}}, {{groupPath}}, {{namespace}} */
  path: string;
  language: string;
  description: string;
  /** If false, file is part of the feature plan, not the scaffold */
  scaffoldRequired: boolean;
}

export interface ProjectTemplate {
  style: ArchitecturalStyle;
  label: string;
  /** ASCII tree shown in prompts and plan output */
  tree: string;
  /** Minimal files that MUST exist for the project to be valid */
  scaffold: TemplateFile[];
}

// ── Template params ───────────────────────────────────────────────────────────

export interface TemplateParams {
  projectName: string;
  /** Java: "com.example" → groupPath = "com/example" */
  groupId?: string;
  /** C# / .NET: root namespace */
  namespace?: string;
  /** Go: module path, e.g. "github.com/user/project" */
  module?: string;
}

export function resolveTemplateFile(file: TemplateFile, params: TemplateParams): TemplateFile {
  const groupPath = params.groupId
    ? params.groupId.replace(/\./g, '/') + '/' + params.projectName
    : `com/example/${params.projectName}`;
  const ns = params.namespace ?? toPascalCase(params.projectName);
  const mod = params.module ?? `github.com/user/${params.projectName}`;

  const resolve = (s: string) =>
    s.replace(/\{\{projectName\}\}/g, params.projectName)
     .replace(/\{\{groupPath\}\}/g, groupPath)
     .replace(/\{\{namespace\}\}/g, ns)
     .replace(/\{\{module\}\}/g, mod);

  return { ...file, path: resolve(file.path), description: resolve(file.description) };
}

function toPascalCase(s: string): string {
  return s.replace(/(^|[-_])(\w)/g, (_, __, c: string) => c.toUpperCase());
}

// ── Canonical templates ───────────────────────────────────────────────────────

const TEMPLATES: Record<ArchitecturalStyle, ProjectTemplate> = {

  'java-maven': {
    style: 'java-maven',
    label: 'Java + Maven (Clean Architecture)',
    tree: `
{{projectName}}/
├─ pom.xml
└─ src/
   ├─ main/
   │  ├─ java/{{groupPath}}/
   │  │  ├─ App.java
   │  │  ├─ domain/
   │  │  │  ├─ model/
   │  │  │  └─ port/
   │  │  ├─ application/
   │  │  │  ├─ service/
   │  │  │  └─ dto/
   │  │  ├─ infrastructure/
   │  │  │  ├─ persistence/
   │  │  │  ├─ web/
   │  │  │  │  └─ rest/
   │  │  │  └─ config/
   │  │  └─ shared/
   │  │     └─ exception/
   │  └─ resources/
   │     └─ application.properties
   └─ test/
      └─ java/{{groupPath}}/
         ├─ infrastructure/web/
         └─ application/service/`.trim(),
    scaffold: [
      { path: 'pom.xml',                                                                           language: 'XML',        description: 'Maven pom with Spring Boot parent, Web, Data JPA, Validation, Security, H2, Lombok',               scaffoldRequired: true },
      { path: 'src/main/java/{{groupPath}}/App.java',                                              language: 'Java',       description: '@SpringBootApplication main class with correct package declaration',                             scaffoldRequired: true },
      { path: 'src/main/resources/application.properties',                                         language: 'properties', description: 'Spring Boot config — server port, h2 datasource, jpa ddl-auto, show-sql',                       scaffoldRequired: true },
      { path: 'src/main/java/{{groupPath}}/shared/exception/GlobalExceptionHandler.java',          language: 'Java',       description: '@ControllerAdvice — handles MethodArgumentNotValidException, EntityNotFoundException, generic', scaffoldRequired: true },
    ]
  },

  'java-gradle': {
    style: 'java-gradle',
    label: 'Java + Gradle (Clean Architecture)',
    tree: `
{{projectName}}/
├─ build.gradle
├─ settings.gradle
└─ src/
   ├─ main/
   │  ├─ java/{{groupPath}}/
   │  │  ├─ Application.java
   │  │  ├─ domain/
   │  │  │  ├─ model/
   │  │  │  └─ port/
   │  │  ├─ application/
   │  │  │  ├─ service/
   │  │  │  └─ dto/
   │  │  ├─ infrastructure/
   │  │  │  ├─ persistence/
   │  │  │  ├─ web/
   │  │  │  │  └─ rest/
   │  │  │  └─ config/
   │  │  └─ shared/
   │  │     └─ exception/
   │  └─ resources/
   │     └─ application.yml
   └─ test/
      └─ java/{{groupPath}}/
         ├─ infrastructure/web/
         └─ application/service/`.trim(),
    scaffold: [
      { path: 'build.gradle',                                                                       language: 'Groovy', description: 'Gradle build — Spring Boot plugin, Web, Data JPA, Validation, Security, H2/PostgreSQL, Lombok', scaffoldRequired: true },
      { path: 'settings.gradle',                                                                    language: 'Groovy', description: 'Gradle settings — rootProject.name',                                                         scaffoldRequired: true },
      { path: 'src/main/java/{{groupPath}}/Application.java',                                       language: 'Java',   description: '@SpringBootApplication entry point with correct package declaration',                        scaffoldRequired: true },
      { path: 'src/main/resources/application.yml',                                                 language: 'YAML',   description: 'Spring Boot config — server port, datasource, jpa ddl-auto, show-sql',                       scaffoldRequired: true },
      { path: 'src/main/java/{{groupPath}}/shared/exception/GlobalExceptionHandler.java',           language: 'Java',   description: '@ControllerAdvice — handles MethodArgumentNotValidException, EntityNotFoundException, generic', scaffoldRequired: true },
    ]
  },

  'python-package': {
    style: 'python-package',
    label: 'Python Package',
    tree: `
{{projectName}}/
├─ pyproject.toml
├─ README.md
├─ {{projectName}}/
│  ├─ __init__.py
│  └─ main.py
└─ tests/
   ├─ __init__.py
   └─ test_main.py`.trim(),
    scaffold: [
      { path: 'pyproject.toml',                   language: 'TOML',   description: 'Project metadata and dependencies (PEP 517)',  scaffoldRequired: true },
      { path: '{{projectName}}/__init__.py',       language: 'Python', description: 'Package init — version and public API',        scaffoldRequired: true },
      { path: '{{projectName}}/main.py',           language: 'Python', description: 'Entry point module',                           scaffoldRequired: true },
      { path: 'tests/__init__.py',                 language: 'Python', description: 'Test package init',                            scaffoldRequired: true },
      { path: 'tests/test_main.py',                language: 'Python', description: 'Unit tests for main module',                   scaffoldRequired: false },
    ]
  },

  'angular': {
    style: 'angular',
    label: 'Angular (CLI)',
    tree: `
{{projectName}}/
├─ angular.json
├─ package.json
├─ tsconfig.json
└─ src/
   ├─ main.ts
   ├─ app/
   │  ├─ app.module.ts
   │  ├─ app.component.ts
   │  └─ app-routing.module.ts
   └─ assets/`.trim(),
    scaffold: [
      { path: 'package.json',                language: 'JSON',        description: 'Angular dependencies and scripts',         scaffoldRequired: true },
      { path: 'angular.json',                language: 'JSON',        description: 'Angular CLI workspace config',             scaffoldRequired: true },
      { path: 'tsconfig.json',               language: 'JSON',        description: 'TypeScript compiler config for Angular',   scaffoldRequired: true },
      { path: 'src/main.ts',                 language: 'TypeScript',  description: 'Angular bootstrap — platformBrowserDynamic', scaffoldRequired: true },
      { path: 'src/app/app.module.ts',       language: 'TypeScript',  description: 'Root NgModule',                            scaffoldRequired: true },
      { path: 'src/app/app.component.ts',    language: 'TypeScript',  description: 'Root AppComponent with selector app-root', scaffoldRequired: true },
      { path: 'src/app/app-routing.module.ts', language: 'TypeScript', description: 'RouterModule with routes array',          scaffoldRequired: false },
    ]
  },

  'csharp-webapi': {
    style: 'csharp-webapi',
    label: 'C# ASP.NET Core Web API',
    tree: `
{{projectName}}/
├─ {{projectName}}.csproj
├─ Program.cs
├─ appsettings.json
├─ Controllers/
│  └─ WeatherForecastController.cs
└─ Models/
   └─ WeatherForecast.cs`.trim(),
    scaffold: [
      { path: '{{projectName}}.csproj',                           language: 'XML',  description: '.NET project file with Web SDK',              scaffoldRequired: true },
      { path: 'Program.cs',                                       language: 'C#',   description: 'Minimal API bootstrap — builder.Build()',      scaffoldRequired: true },
      { path: 'appsettings.json',                                 language: 'JSON', description: 'App configuration — logging, connection strings', scaffoldRequired: true },
      { path: 'Controllers/WeatherForecastController.cs',         language: 'C#',   description: 'Sample ApiController with GET endpoint',       scaffoldRequired: false },
      { path: 'Models/WeatherForecast.cs',                        language: 'C#',   description: 'Sample model record',                          scaffoldRequired: false },
    ]
  },

  'go-api': {
    style: 'go-api',
    label: 'Go REST API',
    tree: `
{{projectName}}/
├─ go.mod
├─ main.go
├─ internal/
│  ├─ handler/
│  │  └─ handler.go
│  └─ model/
│     └─ model.go
└─ pkg/
   └─ middleware/
      └─ middleware.go`.trim(),
    scaffold: [
      { path: 'go.mod',                           language: 'Go',  description: 'Go module file — module path and Go version', scaffoldRequired: true },
      { path: 'main.go',                           language: 'Go',  description: 'Entry point — http.ListenAndServe',          scaffoldRequired: true },
      { path: 'internal/handler/handler.go',       language: 'Go',  description: 'HTTP handlers package',                     scaffoldRequired: true },
      { path: 'internal/model/model.go',           language: 'Go',  description: 'Domain model structs',                      scaffoldRequired: false },
      { path: 'pkg/middleware/middleware.go',       language: 'Go',  description: 'HTTP middleware (logging, CORS)',            scaffoldRequired: false },
    ]
  },

  // ── Previously existing styles (kept for completeness) ──────────────────────

  'react-spa': {
    style: 'react-spa',
    label: 'React SPA (Vite)',
    tree: `
{{projectName}}/
├─ package.json
├─ vite.config.ts
├─ index.html
└─ src/
   ├─ main.tsx
   ├─ App.tsx
   ├─ components/
   └─ pages/`.trim(),
    scaffold: [
      { path: 'package.json',    language: 'JSON',       description: 'Vite + React dependencies',     scaffoldRequired: true },
      { path: 'vite.config.ts',  language: 'TypeScript', description: 'Vite configuration',            scaffoldRequired: true },
      { path: 'index.html',      language: 'HTML',       description: 'HTML entry with #root div',     scaffoldRequired: true },
      { path: 'src/main.tsx',    language: 'TSX',        description: 'ReactDOM.createRoot bootstrap', scaffoldRequired: true },
      { path: 'src/App.tsx',     language: 'TSX',        description: 'Root App component',            scaffoldRequired: true },
    ]
  },

  'react-node': {
    style: 'react-node',
    label: 'React + Node.js/Express',
    tree: `
{{projectName}}/
├─ package.json
├─ server.js
├─ routes/
├─ controllers/
└─ client/
   └─ src/`.trim(),
    scaffold: [
      { path: 'package.json', language: 'JSON',       description: 'Workspace dependencies',         scaffoldRequired: true },
      { path: 'server.js',    language: 'JavaScript', description: 'Express app entry point',        scaffoldRequired: true },
    ]
  },

  'nextjs': {
    style: 'nextjs',
    label: 'Next.js (App Router)',
    tree: `
{{projectName}}/
├─ package.json
├─ next.config.ts
└─ app/
   ├─ layout.tsx
   └─ page.tsx`.trim(),
    scaffold: [
      { path: 'package.json',    language: 'JSON',       description: 'Next.js dependencies',    scaffoldRequired: true },
      { path: 'next.config.ts',  language: 'TypeScript', description: 'Next.js config',          scaffoldRequired: true },
      { path: 'app/layout.tsx',  language: 'TSX',        description: 'Root layout',             scaffoldRequired: true },
      { path: 'app/page.tsx',    language: 'TSX',        description: 'Home page',               scaffoldRequired: true },
    ]
  },

  'vue-spa': {
    style: 'vue-spa',
    label: 'Vue 3 SPA (Vite)',
    tree: `
{{projectName}}/
├─ package.json
├─ vite.config.ts
└─ src/
   ├─ main.ts
   ├─ App.vue
   └─ components/`.trim(),
    scaffold: [
      { path: 'package.json',   language: 'JSON',       description: 'Vue 3 + Vite dependencies', scaffoldRequired: true },
      { path: 'src/main.ts',    language: 'TypeScript', description: 'Vue createApp bootstrap',    scaffoldRequired: true },
      { path: 'src/App.vue',    language: 'Vue SFC',    description: 'Root App component',         scaffoldRequired: true },
    ]
  },

  'django': {
    style: 'django',
    label: 'Python + Django',
    tree: `
{{projectName}}/
├─ manage.py
├─ requirements.txt
└─ {{projectName}}/
   ├─ __init__.py
   ├─ settings.py
   ├─ urls.py
   └─ wsgi.py`.trim(),
    scaffold: [
      { path: 'manage.py',                         language: 'Python', description: 'Django management CLI',     scaffoldRequired: true },
      { path: 'requirements.txt',                  language: 'text',   description: 'Python dependencies',      scaffoldRequired: true },
      { path: '{{projectName}}/__init__.py',        language: 'Python', description: 'Django app init',          scaffoldRequired: true },
      { path: '{{projectName}}/settings.py',        language: 'Python', description: 'Django settings',          scaffoldRequired: true },
      { path: '{{projectName}}/urls.py',            language: 'Python', description: 'Root URL configuration',   scaffoldRequired: true },
    ]
  },

  'flask': {
    style: 'flask',
    label: 'Python + Flask',
    tree: `
{{projectName}}/
├─ requirements.txt
├─ app.py
└─ {{projectName}}/
   ├─ __init__.py
   ├─ config.py
   └─ models.py`.trim(),
    scaffold: [
      { path: 'requirements.txt',            language: 'text',   description: 'Flask + SQLAlchemy dependencies', scaffoldRequired: true },
      { path: 'app.py',                      language: 'Python', description: 'Application factory bootstrap',   scaffoldRequired: true },
      { path: '{{projectName}}/__init__.py', language: 'Python', description: 'Flask application factory',       scaffoldRequired: true },
    ]
  },

  'express-api': {
    style: 'express-api',
    label: 'Node.js + Express API',
    tree: `
{{projectName}}/
├─ package.json
├─ server.js
├─ routes/
├─ controllers/
└─ middleware/`.trim(),
    scaffold: [
      { path: 'package.json', language: 'JSON',       description: 'Express dependencies',     scaffoldRequired: true },
      { path: 'server.js',    language: 'JavaScript', description: 'Express app entry point',  scaffoldRequired: true },
    ]
  },

  'react-native': {
    style: 'react-native',
    label: 'React Native + Expo',
    tree: `
{{projectName}}/
├─ package.json
├─ app.json
├─ App.tsx
└─ src/
   ├─ screens/
   └─ components/`.trim(),
    scaffold: [
      { path: 'package.json', language: 'JSON', description: 'Expo + React Native dependencies', scaffoldRequired: true },
      { path: 'app.json',     language: 'JSON', description: 'Expo configuration',               scaffoldRequired: true },
      { path: 'App.tsx',      language: 'TSX',  description: 'Root app with NavigationContainer', scaffoldRequired: true },
    ]
  },

  'react-clean': {
    style: 'react-clean',
    label: 'React + Vite (Clean Architecture)',
    tree: `
{{projectName}}/
├─ package.json
├─ vite.config.ts
├─ index.html
└─ src/
   ├─ main.tsx
   ├─ domain/
   │  ├─ model/
   │  └─ service/
   ├─ application/
   │  ├─ use-case/
   │  └─ store/
   ├─ infrastructure/
   │  ├─ api/
   │  └─ storage/
   └─ presentation/
      ├─ components/
      ├─ pages/
      └─ layout/`.trim(),
    scaffold: [
      { path: 'package.json',    language: 'JSON',       description: 'Vite + React + TypeScript + React Router + Zustand + Axios dependencies', scaffoldRequired: true },
      { path: 'vite.config.ts',  language: 'TypeScript', description: 'Vite configuration with React plugin and path aliases (@/src)',           scaffoldRequired: true },
      { path: 'index.html',      language: 'HTML',       description: 'HTML entry with #root div and title',                                     scaffoldRequired: true },
      { path: 'src/main.tsx',    language: 'TSX',        description: 'ReactDOM.createRoot bootstrap with BrowserRouter and global store',       scaffoldRequired: true },
    ]
  },

  'spring-fullstack': {
    style: 'spring-fullstack',
    label: 'Spring Boot + React Microfrontend (Monorepo)',
    tree: `
{{projectName}}/
├─ backend/
│  ├─ pom.xml
│  └─ src/
│     ├─ main/
│     │  ├─ java/{{groupPath}}/
│     │  │  ├─ Application.java
│     │  │  ├─ domain/
│     │  │  │  ├─ model/
│     │  │  │  └─ port/
│     │  │  ├─ application/
│     │  │  │  ├─ service/
│     │  │  │  └─ dto/
│     │  │  ├─ infrastructure/
│     │  │  │  ├─ persistence/
│     │  │  │  ├─ web/rest/
│     │  │  │  └─ config/
│     │  │  └─ shared/exception/
│     │  └─ resources/application.yml
│     └─ test/java/{{groupPath}}/
└─ frontend/
   ├─ package.json
   ├─ vite.config.ts
   └─ src/
      ├─ main.tsx
      ├─ domain/
      ├─ application/
      ├─ infrastructure/api/
      └─ presentation/`.trim(),
    scaffold: [
      { path: 'backend/pom.xml',                                                                           language: 'XML',        description: 'Maven pom — Spring Boot parent, Web, Data JPA, Validation, Security, H2, Lombok; CORS for :5173', scaffoldRequired: true },
      { path: 'backend/src/main/java/{{groupPath}}/Application.java',                                      language: 'Java',       description: '@SpringBootApplication entry point with correct package declaration',                              scaffoldRequired: true },
      { path: 'backend/src/main/resources/application.yml',                                                language: 'YAML',       description: 'Spring Boot config — port 8080, h2 datasource, jpa ddl-auto, CORS allow :5173',                   scaffoldRequired: true },
      { path: 'backend/src/main/java/{{groupPath}}/shared/exception/GlobalExceptionHandler.java',          language: 'Java',       description: '@ControllerAdvice — handles validation, not-found, and generic errors',                           scaffoldRequired: true },
      { path: 'frontend/package.json',                                                                     language: 'JSON',       description: 'Vite + React + TypeScript + React Router + Zustand + Axios; proxy to :8080',                      scaffoldRequired: true },
      { path: 'frontend/vite.config.ts',                                                                   language: 'TypeScript', description: 'Vite config with React plugin and server proxy /api → http://localhost:8080',                     scaffoldRequired: true },
      { path: 'frontend/src/main.tsx',                                                                     language: 'TSX',        description: 'ReactDOM.createRoot bootstrap with BrowserRouter',                                               scaffoldRequired: true },
    ]
  },

  'generic': {
    style: 'generic',
    label: 'Generic Project',
    tree: `{{projectName}}/\n├─ README.md\n└─ src/`.trim(),
    scaffold: []
  }
};

// ── Public API ─────────────────────────────────────────────────────────────────

export function getTemplate(style: ArchitecturalStyle): ProjectTemplate {
  return TEMPLATES[style] ?? TEMPLATES['generic'];
}

export function resolveTree(template: ProjectTemplate, params: TemplateParams): string {
  const resolve = (s: string) => {
    const groupPath = params.groupId
      ? params.groupId.replace(/\./g, '/') + '/' + params.projectName
      : `com/example/${params.projectName}`;
    return s
      .replace(/\{\{projectName\}\}/g, params.projectName)
      .replace(/\{\{groupPath\}\}/g, groupPath)
      .replace(/\{\{namespace\}\}/g, params.namespace ?? toPascalCase(params.projectName))
      .replace(/\{\{module\}\}/g, params.module ?? `github.com/user/${params.projectName}`);
  };
  return resolve(template.tree);
}

export function resolveScaffold(template: ProjectTemplate, params: TemplateParams): TemplateFile[] {
  return template.scaffold.map(f => resolveTemplateFile(f, params));
}

/** Detect ArchitecturalStyle from free-text goal (used when no project files exist). */
export function detectStyleFromGoal(goal: string): ArchitecturalStyle | null {
  const g = goal.toLowerCase();

  // Full-stack monorepo: Spring + React/frontend together
  if (
    (/spring|java/.test(g) && /react|frontend|microfrontend/.test(g)) ||
    /full.?stack.*spring|spring.*full.?stack/.test(g)
  ) { return 'spring-fullstack'; }

  // Java: prefer clean architecture by default for all new Java projects
  if (/java.*(maven|gradle|spring)/.test(g) || /spring.*(boot|mvc)/.test(g)) {
    return /gradle/.test(g) ? 'java-gradle' : 'java-maven';
  }

  if (/\bc#\b|\.net|asp\.?net|csharp/.test(g)) { return 'csharp-webapi'; }
  if (/\bgo\b|golang|gin framework/.test(g)) { return 'go-api'; }
  if (/angular/.test(g)) { return 'angular'; }
  if (/react native|expo/.test(g)) { return 'react-native'; }
  if (/next\.?js/.test(g)) { return 'nextjs'; }
  if (/vue/.test(g)) { return 'vue-spa'; }
  if (/django/.test(g)) { return 'django'; }
  if (/flask/.test(g)) { return 'flask'; }
  if (/react/.test(g) && /node|express/.test(g)) { return 'react-node'; }

  // React: use Clean Architecture variant when explicitly requested
  if (/react/.test(g) && /clean arch|arquitectura limpia|hexagonal|iso.?12207/.test(g)) {
    return 'react-clean';
  }
  if (/react/.test(g)) { return 'react-spa'; }

  if (/express|node\.?js.*api/.test(g)) { return 'express-api'; }
  if (/python.*package|pip package/.test(g)) { return 'python-package'; }
  return null;
}

/** Extract project name from goal string. */
export function extractProjectName(goal: string): string {
  // Try quoted name first
  const quoted = goal.match(/["'`]([a-zA-Z][a-zA-Z0-9_-]{1,30})["'`]/);
  if (quoted) { return quoted[1].toLowerCase().replace(/\s+/g, '-'); }
  // Try "called X", "named X", "called X"
  const named = goal.match(/(?:llamado|called|named|proyecto)\s+([a-zA-Z][a-zA-Z0-9_-]{1,30})/i);
  if (named) { return named[1].toLowerCase().replace(/\s+/g, '-'); }
  return 'my-app';
}
