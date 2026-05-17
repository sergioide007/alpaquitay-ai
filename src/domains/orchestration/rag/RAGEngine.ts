/**
 * RAG Engine — Retrieval-Augmented Generation for Domain Agents.
 *
 * Enriches every AI prompt with relevant domain knowledge before sending
 * to the underlying AI provider. This makes all agents smarter without
 * fine-tuning — the knowledge base grows as the system is used.
 *
 * Architecture:
 *   Retrieve  → KnowledgeBase.retrieve(query, domainId, topK)
 *   Augment   → Build context block from top-K chunks
 *   Generate  → Inject into prompt before calling AI provider
 *   Learn     → Store high-quality outputs back as knowledge chunks
 *
 * Privacy: NEVER stores raw user data. Only anonymized domain patterns.
 * ISO/IEC 27001 A.8.2 — Information classification and handling.
 */

import type { AIProvider } from '../../../core/interfaces';
import type { DomainId }   from '../../interfaces/DomainAgentShell';
import { KnowledgeBase, RetrievalResult } from './KnowledgeBase';

export interface RAGOptions {
  domainId?: DomainId;
  topK?: number;
  maxContextTokens?: number;
  learnFromOutput?: boolean;
}

export interface AugmentedPrompt {
  originalQuery: string;
  retrievedChunks: RetrievalResult[];
  augmentedPrompt: string;
  contextTokensUsed: number;
}

export class RAGEngine {
  private readonly kb: KnowledgeBase;

  constructor(workspacePath: string) {
    this.kb = new KnowledgeBase(workspacePath);
  }

  async initialize(): Promise<void> {
    await this.kb.seedDomainKnowledge();
  }

  /**
   * Core RAG operation: retrieve relevant chunks and build an augmented prompt.
   */
  augment(query: string, options: RAGOptions = {}): AugmentedPrompt {
    const topK  = options.topK  ?? 3;
    const limit = options.maxContextTokens ?? 1500;

    const chunks = this.kb.retrieve(query, options.domainId, topK);

    let contextBlock = '';
    let tokensUsed   = 0;

    for (const result of chunks) {
      const entry  = `[${result.chunk.category.toUpperCase()}] ${result.chunk.title}\nSource: ${result.chunk.source}\n${result.chunk.content}\n`;
      const tokens = Math.ceil(entry.length / 4);
      if (tokensUsed + tokens > limit) break;
      contextBlock += entry + '\n';
      tokensUsed   += tokens;
    }

    const augmentedPrompt = contextBlock.length > 0
      ? `--- DOMAIN KNOWLEDGE CONTEXT (RAG) ---\n${contextBlock}--- END CONTEXT ---\n\n${query}`
      : query;

    return {
      originalQuery: query,
      retrievedChunks: chunks,
      augmentedPrompt,
      contextTokensUsed: tokensUsed,
    };
  }

  /**
   * RAG-enhanced AI completion: augments the prompt then calls the provider.
   */
  async complete(provider: AIProvider, query: string, options: RAGOptions & { maxTokens?: number } = {}): Promise<string> {
    const { augmentedPrompt } = this.augment(query, options);
    return provider.complete(augmentedPrompt, { maxTokens: options.maxTokens ?? 1024 });
  }

  /**
   * Learn from a high-quality output: store it back as a knowledge chunk.
   * Only call this for outputs that pass guardrails and quality checks.
   */
  async learn(params: {
    id: string;
    domainId: DomainId;
    title: string;
    content: string;
    keywords: string[];
    source: string;
  }): Promise<void> {
    await this.kb.add({ ...params, category: 'lesson-learned' });
  }

  getKnowledgeBase(): KnowledgeBase {
    return this.kb;
  }
}
