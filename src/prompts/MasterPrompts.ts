export type ArchitecturalStyle =
  | 'react-spa'
  | 'react-node'
  | 'react-clean'
  | 'nextjs'
  | 'vue-spa'
  | 'django'
  | 'flask'
  | 'express-api'
  | 'react-native'
  | 'java-maven'
  | 'java-gradle'
  | 'spring-fullstack'
  | 'python-package'
  | 'angular'
  | 'csharp-webapi'
  | 'go-api'
  | 'generic';

export interface ProjectContext {
  style: ArchitecturalStyle;
  language: string;
  framework: string;
  styleGuide: string;
  structure: string;
  /** Extra rules from spec or user settings */
  customRules?: string;
}

const BASE_RULES = `
### RULES:
1. Generate direct functional code — no explanations, no preamble, no trailing text.
2. Use the correct syntax for the requested language.
3. Create files exactly at the indicated path inside the project structure.
4. Respect the project's code style (indentation, variable names, design patterns).
5. If the project already has files, maintain coherence with existing code.
6. If no language is specified, infer it from the file name or stack.
7. Adapt to the existing folder structure — never invent new top-level directories.
8. Do NOT invent paths: only create files inside existing or explicitly indicated folders.
9. If a file depends on another, use correct references (imports, requires, relative paths).
10. Output ONLY raw file content — no markdown fences, no explanatory text.
11. NEVER include emojis, symbols (✅ ❌ 🔄 🎉 🚀), or decorative markers anywhere.
12. NEVER add congratulatory messages, status indicators, or meta-commentary.
13. NEVER write text after the last line of code (no footers, no summaries, no closing remarks).
14. Comments: write ZERO comments that describe WHAT the code does. A comment is only allowed when the WHY is non-obvious and cannot be expressed through naming.
15. NEVER start your response with conversational text ("Sure, here is...", "Of course...", "Certainly...", "Here is a simple example..."). The first character of your response must be the first character of source code.
16. NEVER write inline comments that assume, explain context, or disclaim ("// Assuming that...", "// this could be expanded...", "// in real world...", "// The actual implementation depends on...").`.trim();

const PRODUCTION_READY_RULES = `
### PRODUCTION COMPLETENESS:
- Every method and function must be fully implemented — no empty body \`{ }\`, no \`// TODO\`, no \`throw new Error('not implemented')\`.
- Every public API endpoint must validate input, handle errors, and return the correct HTTP status code (200/201/400/404/409/422/500).
- Every catch block must either re-throw, log with context, or return a meaningful error response — never leave it empty.
- Every class field declared in an interface or type must be assigned in the constructor or field initializer — no uninitialised properties.
- DTOs, models, and interfaces must use precise types — avoid \`any\` when a specific type can be inferred or declared.
- Only import and reference packages that exist in the project dependency file (package.json / pom.xml / go.mod / requirements.txt / Cargo.toml). Never invent a package name.
- Test files must cover at minimum: one happy-path case, one boundary/edge case, and one error case per public method.
- Log errors at system boundaries with enough context to diagnose (file name, method, relevant ID) — never log credentials or sensitive data.`.trim();

const CLEAN_CODE_RULES = `
### CLEAN CODE & DESIGN PATTERNS:
- SOLID: each class has one responsibility; depend on abstractions (interfaces/ports), not concretions.
- DRY: no duplicated logic — extract shared behaviour into functions, services, or utilities.
- KISS: choose the simplest solution that satisfies the requirement. No premature abstractions.
- Naming: PascalCase classes/interfaces, camelCase functions/variables, UPPER_SNAKE_CASE constants. Names must be self-explanatory — avoid single-letter identifiers outside loop indices.
- Functions: single purpose, ≤ 20 lines, ≤ 3 parameters (use a parameter object if more are needed).
- Error handling: handle all exceptions at system boundaries (HTTP, DB, file I/O). Never swallow errors silently with an empty catch block.
- Imports: only import identifiers that are actually used. Remove every unused import.
- No dead code: no commented-out code blocks, no unreachable statements, no stub methods left with empty bodies.
- Dependency injection: services and repositories must be injected through constructors or DI frameworks — never instantiated with \`new\` inside a class that should not own that dependency.
- Avoid magic numbers and magic strings: extract them as named constants.`.trim();

// Extra rules injected when the active model has < ~4B parameters.
// Small models ignore soft guidelines and need hard prohibitions.
const SMALL_MODEL_RULES = `
### SMALL MODEL STRICT RULES (OVERRIDE ALL OTHERS):
- Write ZERO comments. Not a single // or # line. No docstrings. No JSDoc. No block comments.
- Do NOT narrate what the code does. Every line must be executable code only.
- Do NOT write "// Initialize", "// Loop", "// Check if", "// Return", or any similar label.
- Do NOT add decorative separators like // ------ or # ====.
- NEVER write prose sentences inside the file: no "This code...", "Please note...", "You may need...".
- NEVER use "..." as a placeholder — write the actual implementation.
- NEVER add JSX or React component syntax (<Component />) in TypeScript service/controller files.
- NEVER write text after the last closing brace }. The file ends at the last }.
- Code must be completely comment-free. The variable and function names are the documentation.
- Violation: your output will be discarded and retried at temperature 0.`.trim();

const FILE_FORMAT = `
### FILE GENERATION FORMAT:
For each file request provide:
  - File: [exact path and name]
  - Language: [if applicable]
  - Expected functional content: [brief description]

Generate ONLY the functional content of the file following the rules above.

### CRITICAL OUTPUT RULE:
Your response MUST begin with the FIRST LINE OF SOURCE CODE. Nothing else before it.

FORBIDDEN (output will be discarded and retried):
  - Any text, explanation, or description before the first line of code
  - Any text, footer, or commentary after the last line of code
  - Markdown fences (triple backticks) anywhere
  - Headers: "File:", "Task:", "Context:", "Here is", "The following"
  - Conversational openers: "Sure, here is...", "Of course...", "Certainly...", "Absolutely...", "Here is a simple example..."
  - Inline assumption comments: "// Assuming that...", "// this could be expanded...", "// in real world...", "// The actual implementation..."
  - Emojis, symbols, status markers (such as checkmarks, arrows, flags)
  - Congratulatory messages or outcome summaries
  - Repeated comment blocks or identical lines in a loop

The output must start immediately with the first line of source code:
  import React from 'react';
  export default function ...`.trim();

function buildPrompt(stackBlock: string, extraRules = '', smallModel = false): string {
  const extra = extraRules ? `\n\n### PROJECT-SPECIFIC RULES:\n${extraRules}` : '';
  const smallRules = smallModel ? `\n\n${SMALL_MODEL_RULES}` : '';
  const cleanCode = smallModel ? '' : `\n\n${PRODUCTION_READY_RULES}\n\n${CLEAN_CODE_RULES}`;
  return [
    'You are a **Senior Fullstack Developer and Software Architect**.',
    'Your task is to generate **functional code**, organize files and project structures,',
    'and optimize everything as an experienced professional would.\n',
    BASE_RULES,
    smallRules,
    cleanCode,
    '\n',
    stackBlock,
    extra,
    '\n',
    FILE_FORMAT
  ].join('\n');
}

// ── Style-specific stack blocks ───────────────────────────────────────────────

const STACKS: Record<ArchitecturalStyle, (ctx: ProjectContext) => string> = {
  'react-spa': (ctx) => `
### PROJECT CONTEXT:
- Stack: React + Vite + ${ctx.language}
- Main language: ${ctx.language}, JSX/TSX
- Style: ${ctx.styleGuide}
- Component pattern: Functional components + React Hooks
- State management: React Context / Zustand (prefer what already exists)
- File conventions: PascalCase components, camelCase utilities
- CSS: CSS Modules or Tailwind (match what the project uses)
- Current structure:\n${ctx.structure}`.trim(),

  'react-node': (ctx) => `
### PROJECT CONTEXT:
- Stack: React + Node.js + Express + ${ctx.language}
- Main language: ${ctx.language}, JSX/TSX (frontend), JS/TS (backend)
- Style: ${ctx.styleGuide}
- Frontend: Functional React components, Hooks, relative API calls (/api/*)
- Backend: Express controllers, services, middleware layers (MVC pattern)
- API: REST, JSON responses, error middleware at the end of app.js
- Current structure:\n${ctx.structure}`.trim(),

  'nextjs': (ctx) => `
### PROJECT CONTEXT:
- Stack: Next.js 14+ App Router + ${ctx.language}
- Main language: ${ctx.language}, TSX
- Style: ${ctx.styleGuide}
- Routing: App Router (app/ directory), Server and Client components
- Data fetching: Server Components async/await, Client Components with SWR/React Query
- API routes: app/api/[route]/route.ts pattern
- Styling: Tailwind CSS (match existing if different)
- Current structure:\n${ctx.structure}`.trim(),

  'vue-spa': (ctx) => `
### PROJECT CONTEXT:
- Stack: Vue 3 + Vite + ${ctx.language}
- Main language: ${ctx.language}, SFC (.vue)
- Style: ${ctx.styleGuide}
- Component pattern: Composition API (<script setup>), single-file components
- State management: Pinia (prefer over Vuex)
- File conventions: PascalCase components, camelCase composables (use*)
- Current structure:\n${ctx.structure}`.trim(),

  'django': (ctx) => `
### PROJECT CONTEXT:
- Stack: Python + Django + Django REST Framework
- Main language: Python 3.10+
- Style: PEP 8, Django conventions
- Structure: apps/ pattern (each feature is a Django app)
- API: DRF ViewSets + Routers, ModelSerializer
- Models: use Django ORM, migrations always required after model changes
- Tests: pytest-django, use factories (factory_boy)
- Current structure:\n${ctx.structure}`.trim(),

  'flask': (ctx) => `
### PROJECT CONTEXT:
- Stack: Python + Flask + SQLAlchemy
- Main language: Python 3.10+
- Style: PEP 8, Flask application factory pattern
- Structure: blueprints per feature (auth, api, etc.)
- API: Flask Blueprints, Marshmallow schemas for serialization
- DB: SQLAlchemy models, Flask-Migrate for migrations
- Tests: pytest, test client fixtures
- Current structure:\n${ctx.structure}`.trim(),

  'express-api': (ctx) => `
### PROJECT CONTEXT:
- Stack: Node.js + Express + ${ctx.language}
- Main language: ${ctx.language}
- Style: ${ctx.styleGuide}
- Architecture: MVC — routes → controllers → services → models
- API: REST JSON, versioned routes (/api/v1/*)
- Validation: Joi or Zod (match what exists)
- Auth: JWT middleware (if auth exists in project)
- Current structure:\n${ctx.structure}`.trim(),

  'react-native': (ctx) => `
### PROJECT CONTEXT:
- Stack: React Native + Expo + ${ctx.language}
- Main language: ${ctx.language}, TSX
- Style: ${ctx.styleGuide}
- Navigation: React Navigation v6 (Stack, Tab, Drawer)
- State: Zustand or Redux Toolkit (match what exists)
- Styling: StyleSheet.create() — no web CSS
- Platform checks: Platform.OS when needed, avoid platform-specific files unless necessary
- Current structure:\n${ctx.structure}`.trim(),

  'java-maven': (ctx) => `
### PROJECT CONTEXT:
- Stack: Java + Maven + Spring Boot — Clean Architecture (Robert C. Martin)
- Main language: Java 17+
- Style: Google Java Style Guide — 2-space indent, camelCase methods, PascalCase classes
- Build: pom.xml — Spring Boot parent, Web, Data JPA, Validation, Security, H2/PostgreSQL, Lombok; declare ALL deps explicitly
- Package root: match existing groupId (e.g. com.company.project)
- Clean Architecture layers (strict — NEVER mix responsibilities):
    domain/model/       — Pure Java entities and value objects (NO @Entity, NO Spring; plain POJOs)
    domain/port/        — Java interfaces: output ports (repositories) and domain services (dependency inversion)
    application/service/ — Use cases: orchestrate domain logic through ports; @Service; never touch HTTP or JPA
    application/dto/    — Immutable request/response DTOs (@NotNull/@Size for validation; no JPA)
    infrastructure/persistence/ — @Entity classes, Spring Data JPA repos implementing domain ports
    infrastructure/web/rest/    — @RestController (thin layer: deserialize → call app service → serialize; no logic)
    infrastructure/config/      — @Configuration beans: security, CORS, OpenAPI, datasource
    shared/exception/   — @ControllerAdvice + typed RuntimeException subclasses
- ISO 12207: every layer has its own package; cross-layer imports go INWARD only (infra → app → domain)
- Tests: JUnit 5 + Mockito; @WebMvcTest for REST, @ExtendWith(MockitoExtension) for services, @DataJpaTest for repos; mirror main/ under test/; target ≥ 90% coverage
- Rules: always include package declaration; use @Override; no wildcard imports; no commented-out code; no emojis
- Current structure:\n${ctx.structure}`.trim(),

  'java-gradle': (ctx) => `
### PROJECT CONTEXT:
- Stack: Java + Gradle + Spring Boot — Clean Architecture (Robert C. Martin)
- Main language: Java 17+
- Style: Google Java Style Guide — 2-space indent, camelCase methods, PascalCase classes
- Build: build.gradle — Spring Boot plugin + all required dependencies declared explicitly; application.yml (not .properties)
- Package root: match existing groupId in settings.gradle
- Clean Architecture layers (strict — NEVER mix responsibilities):
    domain/model/       — Pure Java entities and value objects (NO @Entity, NO Spring; plain POJOs)
    domain/port/        — Java interfaces: output ports (repositories) and domain services (dependency inversion)
    application/service/ — Use cases: orchestrate domain logic through ports; @Service; never touch HTTP or JPA
    application/dto/    — Immutable request/response DTOs (@NotNull/@Size for validation; no JPA)
    infrastructure/persistence/ — @Entity classes, Spring Data JPA repos implementing domain ports
    infrastructure/web/rest/    — @RestController (thin layer: deserialize → call app service → serialize; no logic)
    infrastructure/config/      — @Configuration beans: security, CORS, OpenAPI, datasource
    shared/exception/   — @ControllerAdvice + typed RuntimeException subclasses
- ISO 12207: every layer has its own package; cross-layer imports go INWARD only (infra → app → domain)
- Tests: JUnit 5 + Mockito; @WebMvcTest for REST, @ExtendWith(MockitoExtension) for services, @DataJpaTest for repos, @SpringBootTest for integration; mirror main/ under test/; target ≥ 90% coverage
- Rules: always include package declaration; use @Override; no wildcard imports; no commented-out code; no emojis
- Current structure:\n${ctx.structure}`.trim(),

  'python-package': (ctx) => `
### PROJECT CONTEXT:
- Stack: Python Package (PEP 517 / pyproject.toml)
- Main language: Python 3.10+
- Style: PEP 8 — 4-space indent, snake_case, UPPER_CASE constants, PascalCase classes
- Package: each folder with __init__.py is a package; public API exported from __init__
- Config: pyproject.toml (not setup.py) — use [project] table for metadata
- Tests: pytest; test files prefixed test_; fixtures in conftest.py
- Typing: use type hints on all function signatures (Python 3.10+ syntax)
- Current structure:\n${ctx.structure}`.trim(),

  'angular': (ctx) => `
### PROJECT CONTEXT:
- Stack: Angular 17+ (standalone components preferred)
- Main language: TypeScript, HTML templates
- Style: Angular Style Guide — PascalCase components, camelCase methods, kebab-case selectors
- Architecture: feature modules or standalone components; services via DI (@Injectable)
- Routing: RouterModule or provideRouter() in app.config.ts (standalone)
- State: NgRx Signals or simple service-based state
- HTTP: HttpClient with typed generics; interceptors for auth/errors
- Current structure:\n${ctx.structure}`.trim(),

  'csharp-webapi': (ctx) => `
### PROJECT CONTEXT:
- Stack: C# + ASP.NET Core Web API (.NET 8+)
- Main language: C# 12
- Style: Microsoft C# conventions — PascalCase public members, camelCase private fields (_prefixed)
- Architecture: Minimal API or Controllers; Services via DI (builder.Services.Add*)
- File-scoped namespaces: namespace ${ctx.framework}; (no braces)
- Async: all I/O must be async/await; return Task<T> or IActionResult
- Config: appsettings.json + IOptions<T> pattern for typed config
- Tests: xUnit + Moq; WebApplicationFactory for integration tests
- Current structure:\n${ctx.structure}`.trim(),

  'go-api': (ctx) => `
### PROJECT CONTEXT:
- Stack: Go REST API
- Main language: Go 1.21+
- Style: gofmt + Effective Go — short lowercase package names, exported PascalCase identifiers
- Module: go.mod with module path (e.g. github.com/user/project)
- Structure: cmd/ for entrypoints, internal/ for private packages, pkg/ for reusable
- HTTP: net/http stdlib or Gin (match what exists); handler functions take (w, r) or *gin.Context
- Errors: explicit error returns; wrap with fmt.Errorf("...: %w", err)
- No global state; pass dependencies via struct fields or function params
- Current structure:\n${ctx.structure}`.trim(),

  'react-clean': (ctx) => `
### PROJECT CONTEXT:
- Stack: React + Vite + ${ctx.language} — Clean Architecture (Robert C. Martin / ISO 12207)
- Main language: ${ctx.language}, TSX/TS
- Style: ${ctx.styleGuide}
- Clean Architecture layers (strict — imports go INWARD only: presentation → application → domain):
    domain/model/     — TypeScript interfaces and value types (NO React, NO axios; pure business types)
    domain/service/   — Pure domain logic functions (no side effects, no async I/O)
    application/use-case/ — Orchestrate domain services; one file per use case; framework-agnostic
    application/store/    — Zustand slices or Redux Toolkit; calls use-cases, never infra directly
    infrastructure/api/   — Axios/fetch adapters implementing domain ports; all HTTP here
    infrastructure/storage/ — localStorage/sessionStorage adapters
    presentation/components/ — Reusable UI components (PascalCase, no business logic)
    presentation/pages/      — Route-level page components; wire up hooks and components
    presentation/layout/     — Layout wrappers (Navbar, Sidebar, Footer)
- File naming: PascalCase components, camelCase hooks (use*), camelCase utils
- Tests: Vitest + Testing Library; unit for domain/use-case, integration for presentation
- Current structure:\n${ctx.structure}`.trim(),

  'spring-fullstack': (ctx) => `
### PROJECT CONTEXT:
- Stack: Spring Boot + React Microfrontend — Full-Stack Monorepo (ISO 12207 / Clean Architecture)
- Main languages: Java 17+ (backend), TypeScript/TSX (frontend)
- Monorepo layout:
    backend/  — Spring Boot + Clean Architecture (domain / application / infrastructure / shared)
    frontend/ — React + Vite + Clean Architecture (domain / application / infrastructure / presentation)
- Backend Clean Architecture (package root: match groupId):
    domain/model/       — Pure Java POJOs (no Spring, no JPA)
    domain/port/        — Repository and service interfaces
    application/service/ — Use cases (@Service); no HTTP, no JPA
    application/dto/    — Request/response DTOs
    infrastructure/persistence/ — @Entity, Spring Data JPA repos
    infrastructure/web/rest/    — @RestController (thin HTTP layer)
    infrastructure/config/      — Security, CORS, Swagger
    shared/exception/   — @ControllerAdvice + custom exceptions
- Frontend Clean Architecture (src/):
    domain/model/     — TypeScript types (no React, no axios)
    application/use-case/ — Business use cases
    application/store/    — Zustand/Redux slices
    infrastructure/api/   — HTTP adapters (axios)
    presentation/         — components/, pages/, layout/
- Style: ${ctx.styleGuide}
- Current structure:\n${ctx.structure}`.trim(),

  'generic': (ctx) => `
### PROJECT CONTEXT:
- Stack: ${ctx.framework}
- Main language: ${ctx.language}
- Style: ${ctx.styleGuide}
- Adapt to the conventions visible in the existing structure
- Current structure:\n${ctx.structure}`.trim()
};

// ── Public API ─────────────────────────────────────────────────────────────────

export function getMasterPrompt(ctx: ProjectContext, smallModel = false): string {
  const stackFn = STACKS[ctx.style] ?? STACKS['generic'];
  const stackBlock = stackFn(ctx);
  return buildPrompt(stackBlock, ctx.customRules, smallModel);
}

/** Returns a concise chat system prompt for an active project (used in _handleChat). */
export function getChatSystemPrompt(ctx: ProjectContext): string {
  const style = ctx.style === 'generic' ? ctx.framework : ctx.style.toUpperCase();
  return [
    `Senior Fullstack Developer & Software Architect — ${style} project.`,
    `Language: ${ctx.language}. Style: ${ctx.styleGuide}.`,
    'Be concise and actionable. Provide code directly when asked.',
    ctx.customRules ? `Project rules: ${ctx.customRules}` : ''
  ].filter(Boolean).join(' ');
}
