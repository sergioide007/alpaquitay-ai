/**
 * Knowledge Base — Domain knowledge store for RAG augmentation.
 *
 * Each knowledge entry stores text chunks + lightweight keyword index.
 * Vector embeddings are stored separately by the EmbeddingAdapter.
 *
 * Privacy: no PII may be stored here — only organizational/process knowledge.
 * ISO/IEC 27001 A.8.1 — Information assets classification.
 */

import * as fs   from 'fs';
import * as path from 'path';
import type { DomainId } from '../../interfaces/DomainAgentShell';

export type KnowledgeCategory =
  | 'domain-knowledge'
  | 'best-practice'
  | 'iso-standard'
  | 'architectural-decision'
  | 'lesson-learned'
  | 'process-definition';

export interface KnowledgeChunk {
  id: string;
  domainId: DomainId | 'global';
  category: KnowledgeCategory;
  title: string;
  content: string;
  keywords: string[];
  source: string;
  createdAt: Date;
  lastUsedAt?: Date;
  useCount: number;
}

export interface RetrievalResult {
  chunk: KnowledgeChunk;
  relevanceScore: number;
}

export class KnowledgeBase {
  private chunks: KnowledgeChunk[] = [];
  private readonly storageFile: string;
  private loaded = false;

  constructor(workspacePath: string) {
    this.storageFile = path.join(workspacePath, '.alpaquitay', 'orchestration', 'knowledge.json');
  }

  async add(chunk: Omit<KnowledgeChunk, 'useCount' | 'createdAt'>): Promise<void> {
    await this.ensureLoaded();
    const existing = this.chunks.findIndex(c => c.id === chunk.id);
    const entry: KnowledgeChunk = { ...chunk, createdAt: new Date(), useCount: 0 };
    if (existing >= 0) {
      this.chunks[existing] = entry;
    } else {
      this.chunks.push(entry);
    }
    await this.persist();
  }

  /**
   * Keyword-based retrieval (BM25-lite — no vector dependency).
   * The RAGEngine can upgrade to vector similarity when embeddings are available.
   */
  retrieve(query: string, domainId?: DomainId | 'global', topK = 5): RetrievalResult[] {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const scored = this.chunks
      .filter(c => !domainId || c.domainId === domainId || c.domainId === 'global')
      .map(chunk => {
        const text = `${chunk.title} ${chunk.content} ${chunk.keywords.join(' ')}`.toLowerCase();
        const tf = terms.reduce((acc, t) => {
          const matches = (text.match(new RegExp(t, 'g')) || []).length;
          return acc + matches / (text.length / 100 + 1);
        }, 0);
        const idf = terms.filter(t => text.includes(t)).length / (terms.length + 1);
        return { chunk, relevanceScore: tf * idf };
      })
      .filter(r => r.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, topK);

    scored.forEach(r => {
      r.chunk.lastUsedAt = new Date();
      r.chunk.useCount++;
    });

    return scored;
  }

  async seedDomainKnowledge(): Promise<void> {
    const seeds: Array<Omit<KnowledgeChunk, 'useCount' | 'createdAt'>> = [
      { id: 'iso42010-01', domainId: 'software-architect', category: 'iso-standard', title: 'ISO/IEC 42010 Architecture Description', content: 'An architecture description identifies stakeholders and their concerns, viewpoints, views, and correspondences. Every architectural decision must trace to at least one stakeholder concern.', keywords: ['architecture', 'stakeholder', 'viewpoint', 'ADR', 'ISO 42010'], source: 'ISO/IEC 42010:2011' },
      { id: 'togaf-adm-01', domainId: 'software-architect', category: 'best-practice', title: 'TOGAF ADM Phase B — Business Architecture', content: 'Business Architecture defines the strategy, governance, organization, and key business processes. It must precede Application and Technology architecture phases.', keywords: ['TOGAF', 'ADM', 'business', 'architecture', 'governance'], source: 'TOGAF 10' },
      { id: 'dora-elite-01', domainId: 'devops', category: 'best-practice', title: 'DORA Elite Performance Thresholds', content: 'Elite teams: deploy on-demand (multiple times/day), lead time < 1 hour, change failure rate < 5%, MTTR < 1 hour.', keywords: ['DORA', 'elite', 'deployment', 'lead time', 'MTTR'], source: 'DORA State of DevOps 2023' },
      { id: 'iso27001-a14-01', domainId: 'devsecops', category: 'iso-standard', title: 'ISO 27001 A.14 System Acquisition', content: 'Security requirements must be included in requirements for information systems. Security testing must occur at every stage of the development lifecycle.', keywords: ['ISO 27001', 'security', 'SDLC', 'requirements', 'testing'], source: 'ISO/IEC 27001:2022' },
      { id: 'iso29119-01', domainId: 'qa', category: 'iso-standard', title: 'ISO/IEC 29119 Software Testing', content: 'Testing must have documented test plans, test cases, and test results. Exit criteria must be defined before testing begins.', keywords: ['ISO 29119', 'testing', 'test plan', 'exit criteria'], source: 'ISO/IEC 29119:2013' },
      { id: 'iso9001-pdca-01', domainId: 'process', category: 'iso-standard', title: 'ISO 9001 PDCA Cycle', content: 'Plan-Do-Check-Act is the foundation of ISO 9001. Every process must have defined inputs, outputs, KPIs, and a continuous improvement mechanism.', keywords: ['ISO 9001', 'PDCA', 'process', 'KPI', 'improvement'], source: 'ISO 9001:2015' },
      { id: 'cefr-b1-01', domainId: 'english', category: 'domain-knowledge', title: 'CEFR B1 Can-Do Statements', content: 'B1 learners can deal with most situations likely to arise travelling in an area where the language is spoken. They can produce simple connected text on familiar topics.', keywords: ['CEFR', 'B1', 'intermediate', 'learning', 'language'], source: 'Council of Europe CEFR 2020' },
      { id: 'cloud-waf-01', domainId: 'cloud', category: 'best-practice', title: 'AWS Well-Architected Security Pillar', content: 'Implement a strong identity foundation, enable traceability, apply security at all layers, automate security best practices, protect data in transit and at rest, keep people away from data.', keywords: ['AWS', 'security', 'Well-Architected', 'IAM', 'encryption'], source: 'AWS Well-Architected Framework' },
      { id: 'solid-srp-01', domainId: 'software-engineer', category: 'best-practice', title: 'Single Responsibility Principle', content: 'A class should have only one reason to change. Each class should encapsulate one and only one responsibility. Violation leads to fragile, hard-to-maintain code.', keywords: ['SOLID', 'SRP', 'responsibility', 'class', 'maintainability'], source: 'Clean Architecture — Robert C. Martin' },
      { id: 'six-sigma-dmaic-01', domainId: 'process', category: 'best-practice', title: 'Six Sigma DMAIC', content: 'Define the problem and goals. Measure current performance. Analyze root causes. Improve by implementing solutions. Control to sustain improvements. Requires data at each phase.', keywords: ['Six Sigma', 'DMAIC', 'process', 'improvement', 'data'], source: 'Six Sigma Body of Knowledge' },
    ];

    for (const seed of seeds) {
      await this.add(seed);
    }
  }

  getStats(): { total: number; byDomain: Record<string, number>; topUsed: KnowledgeChunk[] } {
    const byDomain: Record<string, number> = {};
    this.chunks.forEach(c => { byDomain[c.domainId] = (byDomain[c.domainId] ?? 0) + 1; });
    const topUsed = [...this.chunks].sort((a, b) => b.useCount - a.useCount).slice(0, 5);
    return { total: this.chunks.length, byDomain, topUsed };
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      if (fs.existsSync(this.storageFile)) {
        this.chunks = JSON.parse(fs.readFileSync(this.storageFile, 'utf-8')) as KnowledgeChunk[];
      }
    } catch {
      this.chunks = [];
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.storageFile);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.storageFile, JSON.stringify(this.chunks, null, 2), 'utf-8');
  }
}
