/**
 * QA Domain Model
 * ISO/IEC 29119 (Software Testing) · ISO 9001 · ISTQB
 */

export type TestType = 'unit' | 'integration' | 'e2e' | 'performance' | 'security' | 'accessibility' | 'regression' | 'smoke';
export type TestStatus = 'pass' | 'fail' | 'skip' | 'blocked' | 'pending';
export type SeverityLevel = 'blocker' | 'critical' | 'major' | 'minor' | 'trivial';
export type TestingQuadrant = 'Q1_unit' | 'Q2_functional' | 'Q3_exploratory' | 'Q4_performance';

export interface TestCase {
  id: string;
  title: string;
  type: TestType;
  quadrant: TestingQuadrant;
  priority: 'high' | 'medium' | 'low';
  preconditions: string;
  steps: string[];
  expectedResult: string;
  automatable: boolean;
  isoReference: string;
}

export interface TestPlan {
  id: string;
  scope: string;
  objectives: string[];
  strategy: string;
  testCases: TestCase[];
  entryExitCriteria: { entry: string[]; exit: string[] };
  risks: Array<{ risk: string; mitigation: string }>;
  estimatedEffortHours: number;
}

export interface BugReport {
  id: string;
  title: string;
  severity: SeverityLevel;
  priority: 'high' | 'medium' | 'low';
  environment: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  rootCauseHypothesis: string;
  affectedComponents: string[];
  attachments: string[];
}

export interface CoverageReport {
  overallCoverage: number;
  lineCoverage: number;
  branchCoverage: number;
  functionCoverage: number;
  uncoveredAreas: string[];
  riskAreas: string[];
  recommendation: string;
}

export interface QualityGate {
  name: string;
  minCoverage: number;
  maxCriticalBugs: number;
  maxBlockerBugs: number;
  performanceThresholdMs: number;
  passed: boolean;
  failures: string[];
}
