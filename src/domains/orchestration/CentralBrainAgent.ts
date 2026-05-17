/**
 * Central Brain Agent — The Superagent.
 *
 * The highest-level orchestration entity. It:
 *   1. Receives high-level strategic objectives from the user
 *   2. Sanitizes all input/output through PrivacyGuard (GDPR/ISO 27001)
 *   3. Augments context with RAG (domain knowledge retrieval)
 *   4. Uses MetaheuristicEngine to plan optimal agent execution
 *   5. Delegates to OrchestratorAgent for multi-agent execution
 *   6. Applies RecursiveRefinement to improve the synthesized output
 *   7. Learns from high-quality results (stores back to KnowledgeBase)
 *   8. Provides a unified, coherent response to the user
 *
 * The Central Brain never directly calls domain shells —
 * it orchestrates the OrchestratorAgent, which orchestrates the shells.
 * This two-level hierarchy enables:
 *   - CentralBrain: strategic decomposition + quality control + learning
 *   - Orchestrator:  tactical routing + parallel execution + aggregation
 *   - Domain Shells: specialist expertise + compliance guardrails
 *
 * ─── Architecture ─────────────────────────────────────────────────────────
 * Pattern:   Hierarchical Multi-Agent System (HMAS)
 * TOGAF:     Enterprise Architecture — strategic level coordination
 * ArchiMate: Application Collaboration + Technology Collaboration
 * ISO:       ISO/IEC 27001 (privacy) · ISO/IEC 42010 (architecture decisions)
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { AIProvider }         from '../../core/interfaces';
import { OrchestratorAgent, OrchestratorResult } from './OrchestratorAgent';
import { RAGEngine }               from './rag/RAGEngine';
import { PrivacyGuard }            from './privacy/PrivacyGuard';
import { MetaheuristicEngine }     from './metaheuristic/MetaheuristicEngine';
import { RefinementRubric }        from './metaheuristic/RecursiveRefinement';
import { AgentRegistry }           from './AgentRegistry';
import { randomUUID }              from 'crypto';

export interface BrainSessionContext {
  sessionId: string;
  userId:    string;
  history:   Array<{ objective: string; summary: string; timestamp: Date }>;
}

export interface BrainResult {
  sessionId:      string;
  objective:      string;
  finalResponse:  string;
  qualityScore:   number;
  refinedFrom:    number;
  orchestration:  OrchestratorResult;
  knowledgeAdded: boolean;
  privacyClean:   boolean;
  elapsedMs:      number;
}

const DEFAULT_RUBRIC: RefinementRubric = {
  threshold: 75,
  domainContext: 'Multi-domain software engineering and organizational process improvement',
  criteria: [
    { name: 'Completeness',  description: 'All parts of the objective are addressed',           weight: 0.30 },
    { name: 'Accuracy',      description: 'Technical facts are correct per ISO standards',      weight: 0.30 },
    { name: 'Actionability', description: 'Output contains concrete, implementable steps',      weight: 0.25 },
    { name: 'Clarity',       description: 'Response is clear and well-structured',              weight: 0.15 },
  ],
};

export class CentralBrainAgent {
  private readonly orchestrator  = new OrchestratorAgent();
  private readonly registry      = new AgentRegistry();
  private readonly privacy       = new PrivacyGuard();
  private rag!:                    RAGEngine;
  private metaheuristic!:          MetaheuristicEngine;
  private provider!:               AIProvider;
  private workspacePath!:          string;
  private session!:                BrainSessionContext;

  async initialize(provider: AIProvider, workspacePath: string, userId = 'default'): Promise<void> {
    this.provider      = provider;
    this.workspacePath = workspacePath;
    this.rag           = new RAGEngine(workspacePath);
    this.metaheuristic = new MetaheuristicEngine(provider, { maxRefinementIterations: 3 });
    this.session       = { sessionId: randomUUID(), userId, history: [] };

    await this.rag.initialize();
    await this.orchestrator.initialize(provider, workspacePath);
  }

  /**
   * Primary interface: process a strategic objective end-to-end.
   */
  async process(objective: string, contextParams: Record<string, unknown> = {}): Promise<BrainResult> {
    const start = Date.now();

    // ── Step 1: Privacy sanitization ──────────────────────────────────────────
    const privacyReport = this.privacy.sanitize(objective);
    if (privacyReport.riskLevel === 'high') {
      console.warn(`[CentralBrain] High-risk PII detected in objective. Sanitized before processing. GDPR: ${privacyReport.gdprArticlesTriggered.join(', ')}`);
    }
    const safeObjective = privacyReport.sanitizedText;

    // ── Step 2: RAG context augmentation ─────────────────────────────────────
    const augmented = this.rag.augment(safeObjective, { topK: 4 });

    // ── Step 3: Session history injection ────────────────────────────────────
    const enrichedObjective = this.injectSessionHistory(augmented.augmentedPrompt);

    // ── Step 4: Multi-agent orchestration ────────────────────────────────────
    const orchestration = await this.orchestrator.execute(enrichedObjective, contextParams);

    // ── Step 5: Recursive refinement of synthesized output ───────────────────
    const refinementResult = await this.metaheuristic.refineOutput(
      orchestration.aggregatedOutput,
      safeObjective,
      DEFAULT_RUBRIC,
    );

    // ── Step 6: Learn from high-quality output ───────────────────────────────
    let knowledgeAdded = false;
    if (refinementResult.finalScore >= 80 && this.privacy.isSafeToStore(refinementResult.finalOutput)) {
      await this.rag.learn({
        id:       randomUUID(),
        domainId: orchestration.plan.tasks[0]?.domainId ?? 'software-engineer',
        title:    `Lesson: ${safeObjective.slice(0, 60)}`,
        content:  refinementResult.finalOutput.slice(0, 1000),
        keywords: safeObjective.split(/\s+/).filter(w => w.length > 4).slice(0, 10),
        source:   `CentralBrain session ${this.session.sessionId}`,
      });
      knowledgeAdded = true;
    }

    // ── Step 7: Update session history ───────────────────────────────────────
    this.session.history.push({
      objective,
      summary: refinementResult.finalOutput.slice(0, 200),
      timestamp: new Date(),
    });

    return {
      sessionId:     this.session.sessionId,
      objective,
      finalResponse: refinementResult.finalOutput,
      qualityScore:  refinementResult.finalScore,
      refinedFrom:   refinementResult.iterations.length,
      orchestration,
      knowledgeAdded,
      privacyClean:  !privacyReport.piiFound,
      elapsedMs:     Date.now() - start,
    };
  }

  /**
   * Discover all available agents and their capabilities.
   * Used by UI to render the agent catalog.
   */
  getAgentCatalog() {
    return this.registry.getAll().map(d => ({
      domainId:     d.domainId,
      name:         d.name,
      description:  d.description,
      version:      d.version,
      isoStandards: d.isoStandards,
      tags:         d.tags,
      useCases:     d.capabilities.map(c => c.useCaseId),
    }));
  }

  /**
   * Direct delegation to a specific agent (bypasses orchestration planning).
   * Use for targeted, single-domain requests.
   */
  async delegateTo(domainId: string, useCaseId: string, params: Record<string, unknown>) {
    const safeParams = this.privacy.redactObject(params);
    const shell = await this.registry.getInstance(domainId as import('../interfaces/DomainAgentShell').DomainId, this.provider, this.workspacePath);
    return shell.run(useCaseId, safeParams);
  }

  getSession(): BrainSessionContext {
    return { ...this.session };
  }

  getKnowledgeStats() {
    return this.rag.getKnowledgeBase().getStats();
  }

  private injectSessionHistory(prompt: string): string {
    if (this.session.history.length === 0) return prompt;
    const recent = this.session.history.slice(-3);
    const historyBlock = recent.map(h => `[${h.timestamp.toISOString()}] ${h.objective}: ${h.summary}`).join('\n');
    return `--- SESSION CONTEXT (last ${recent.length} interactions) ---\n${historyBlock}\n--- END SESSION ---\n\n${prompt}`;
  }
}
