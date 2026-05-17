/**
 * Software Engineer Domain Model
 * ISO/IEC 12207 (Software Lifecycle) · ISO/IEC 25010 (Software Quality)
 */

export type CodeQualityMetric = 'complexity' | 'coupling' | 'cohesion' | 'duplication' | 'coverage' | 'debt';
export type DesignPattern = 'factory' | 'singleton' | 'observer' | 'strategy' | 'decorator' | 'repository' | 'cqrs' | 'saga';
export type CodeSmell = 'god_class' | 'long_method' | 'feature_envy' | 'data_clump' | 'primitive_obsession' | 'shotgun_surgery';
export type TechDebtCategory = 'architecture' | 'code' | 'test' | 'documentation' | 'infrastructure';

export interface CodeReviewResult {
  file: string;
  issues: Array<{ line?: number; severity: 'error' | 'warning' | 'info'; rule: string; message: string; suggestion: string }>;
  qualityScore: number;
  detectedSmells: CodeSmell[];
  suggestedPatterns: DesignPattern[];
  estimatedDebtMinutes: number;
}

export interface TechDebtItem {
  id: string;
  category: TechDebtCategory;
  description: string;
  impactScore: number;
  effortEstimateHours: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  affectedFiles: string[];
}

export interface DesignPatternRecommendation {
  pattern: DesignPattern;
  rationale: string;
  implementationSteps: string[];
  tradeoffs: string;
  isoReference: string;
}

export interface SOLIDAnalysis {
  singleResponsibility: { score: number; violations: string[] };
  openClosed:           { score: number; violations: string[] };
  liskovSubstitution:   { score: number; violations: string[] };
  interfaceSegregation: { score: number; violations: string[] };
  dependencyInversion:  { score: number; violations: string[] };
  overallScore: number;
  recommendations: string[];
}
