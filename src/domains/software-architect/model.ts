/**
 * Software Architect Domain Model
 * ISO/IEC 42010 (Architecture Description) · TOGAF · ArchiMate 3.2
 */

export type ArchitecturalStyle = 'monolith' | 'microservices' | 'event-driven' | 'serverless' | 'hexagonal' | 'cqrs' | 'saga' | 'layered';
export type QualityAttribute = 'scalability' | 'reliability' | 'security' | 'performance' | 'maintainability' | 'portability' | 'testability';
export type ADRStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';

export interface ArchitecturalDecisionRecord {
  id: string;
  title: string;
  status: ADRStatus;
  context: string;
  decision: string;
  consequences: string;
  alternatives: string[];
  qualityAttributes: QualityAttribute[];
  isoReference: string;
  createdAt: Date;
}

export interface TechnologyRadar {
  adopt:   TechEntry[];
  trial:   TechEntry[];
  assess:  TechEntry[];
  hold:    TechEntry[];
}

export interface TechEntry {
  name: string;
  category: 'languages' | 'frameworks' | 'platforms' | 'tools' | 'techniques';
  rationale: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ArchitectureAssessment {
  currentStyle: ArchitecturalStyle;
  qualityScores: Record<QualityAttribute, number>;
  risks: Array<{ risk: string; likelihood: 'low' | 'medium' | 'high'; impact: 'low' | 'medium' | 'high'; mitigation: string }>;
  evolutionPath: string[];
  recommendedStyle: ArchitecturalStyle;
  migrationRoadmap: string[];
}

export interface C4Diagram {
  level: 'context' | 'container' | 'component' | 'code';
  title: string;
  elements: Array<{ id: string; type: string; name: string; technology?: string; description: string }>;
  relationships: Array<{ from: string; to: string; label: string; technology?: string }>;
}
