/**
 * AI Expert Domain Model
 * ISO/IEC 42001:2023 (AI Management System) · EU AI Act · NIST AI RMF
 * IEEE 7000 (AI Ethics) · MLOps Maturity Model
 */

export type AIRiskTier = 'unacceptable' | 'high' | 'limited' | 'minimal';
export type ModelType = 'llm' | 'embedding' | 'vision' | 'multimodal' | 'classifier' | 'regressor' | 'diffusion' | 'rl';
export type RAGStrategy = 'naive' | 'advanced' | 'modular' | 'agentic' | 'graph' | 'self-rag';
export type PromptTechnique = 'zero-shot' | 'few-shot' | 'chain-of-thought' | 'tree-of-thought' | 'react' | 'self-consistency' | 'meta-prompting';
export type MLOpsStage = 'data' | 'feature' | 'train' | 'eval' | 'serve' | 'monitor' | 'retrain';

export interface LLMEvaluation {
  modelId: string;
  provider: string;
  contextWindow: number;
  benchmarks: Array<{ name: string; score: number; category: string }>;
  costPer1kTokens: { input: number; output: number };
  latencyP50Ms: number;
  latencyP99Ms: number;
  strengths: string[];
  weaknesses: string[];
  recommendedUseCases: string[];
  notRecommendedFor: string[];
}

export interface PromptTemplate {
  id: string;
  technique: PromptTechnique;
  domain: string;
  systemPrompt: string;
  userTemplate: string;
  fewShotExamples?: Array<{ input: string; output: string }>;
  chainOfThoughtSteps?: string[];
  outputFormat: string;
  tokenEstimate: number;
  qualityScore: number;
}

export interface RAGArchitecture {
  strategy: RAGStrategy;
  chunkingMethod: 'fixed' | 'semantic' | 'recursive' | 'agentic';
  chunkSize: number;
  chunkOverlap: number;
  embeddingModel: string;
  vectorStore: 'pinecone' | 'chroma' | 'qdrant' | 'weaviate' | 'faiss' | 'pgvector';
  retrievalMethod: 'similarity' | 'mmr' | 'hybrid' | 'rerank';
  topK: number;
  reranker?: string;
  queryExpansion: boolean;
  hypotheticalDocumentEmbedding: boolean;
  estimatedAccuracyGain: number;
}

export interface AISystemDesign {
  pattern: 'single-agent' | 'multi-agent' | 'rag' | 'fine-tuned' | 'hybrid';
  components: Array<{
    name: string;
    type: 'llm' | 'retriever' | 'tool' | 'orchestrator' | 'memory' | 'guardrail';
    technology: string;
    rationale: string;
  }>;
  dataFlow: string[];
  latencyBudgetMs: number;
  costEstimateMonthly: number;
  scalingStrategy: string;
  observabilityStack: string[];
}

export interface AIGovernanceReport {
  euAiActRiskTier: AIRiskTier;
  iso42001Controls: Array<{ control: string; status: 'implemented' | 'partial' | 'missing'; evidence: string }>;
  nistAiRmfFunctions: Record<'govern' | 'map' | 'measure' | 'manage', number>;
  biasAssessment: { detected: boolean; categories: string[]; mitigation: string[] };
  explainabilityLevel: 'black-box' | 'post-hoc' | 'inherently-interpretable';
  dataGovernance: string[];
  humanOversightMechanisms: string[];
  incidentResponsePlan: string[];
}

export interface MLOpsPipeline {
  maturityLevel: 0 | 1 | 2 | 3;
  stages: Array<{ stage: MLOpsStage; tools: string[]; automated: boolean; sla: string }>;
  cicdForML: boolean;
  featureStore: string;
  experimentTracking: string;
  modelRegistry: string;
  monitoringMetrics: string[];
  driftDetection: boolean;
  retrainingTrigger: 'schedule' | 'drift' | 'performance' | 'data-change';
}
