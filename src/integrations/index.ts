// ── Public API ────────────────────────────────────────────────────────────────
// Import from this barrel to avoid coupling to internal paths.

export * from './interfaces';
export * from './IntegrationConfig';
export { BaseIntegration } from './BaseIntegration';
export { IntegrationRegistry } from './IntegrationRegistry';

// ── Integration implementations ───────────────────────────────────────────────

export { ClineProvider } from './cline/ClineProvider';
export { LangChainProvider, ChainFactory, PromptTemplate, LLMStep, StringOutputParser } from './langchain/LangChainProvider';
export { LangSmithTracer } from './langchain/LangSmithTracer';
export { NotionKnowledge } from './notion/NotionKnowledge';
export { CodeIndexer, extractSymbols, InvertedIndex } from './datafusion/CodeIndexer';
export { VortexPipeline, VORTEX_EVENTS } from './streaming/VortexPipeline';
export { CursorIntegration } from './editors/CursorIntegration';
export { WindsurfIntegration } from './editors/WindsurfIntegration';

// ── Factory: build a fully-wired IntegrationRegistry from VS Code context ────

import * as vscode from 'vscode';
import { IntegrationRegistry } from './IntegrationRegistry';
import { HybridConfigReader } from './IntegrationConfig';
import { ClineProvider } from './cline/ClineProvider';
import { LangChainProvider } from './langchain/LangChainProvider';
import { LangSmithTracer } from './langchain/LangSmithTracer';
import { NotionKnowledge } from './notion/NotionKnowledge';
import { CodeIndexer } from './datafusion/CodeIndexer';
import { VortexPipeline } from './streaming/VortexPipeline';
import { CursorIntegration } from './editors/CursorIntegration';
import { WindsurfIntegration } from './editors/WindsurfIntegration';
import { AIProvider } from '../core/interfaces';

export function buildIntegrationRegistry(
  storage: vscode.SecretStorage,
  activeProvider: AIProvider
): IntegrationRegistry {
  const cfg = new HybridConfigReader().toHybridConfig();
  const registry = new IntegrationRegistry(storage, cfg);

  registry
    .register(new ClineProvider(activeProvider))
    .register(new LangChainProvider(activeProvider))
    .register(new LangSmithTracer(cfg.langsmithProject))
    .register(new NotionKnowledge(cfg.notionRootPageId))
    .register(new CodeIndexer(cfg.indexerMaxResults))
    .register(new VortexPipeline())
    .register(new CursorIntegration())
    .register(new WindsurfIntegration());

  return registry;
}
