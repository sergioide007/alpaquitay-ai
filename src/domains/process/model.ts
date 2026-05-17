/**
 * Process Management Domain Model
 * ISO 9001:2015 · BPM CBOK · BPMN 2.0 · CMMI · Six Sigma · ITIL v4
 */

export type ProcessFramework = 'iso9001' | 'cmmi' | 'six-sigma' | 'lean' | 'bpm-cbok' | 'itil4' | 'cobit' | 'togaf';
export type WasteType = 'defects' | 'overproduction' | 'waiting' | 'non-utilized-talent' | 'transportation' | 'inventory' | 'motion' | 'extra-processing';
export type MaturityLevel = 1 | 2 | 3 | 4 | 5;
export type ProcessStatus = 'as-is' | 'to-be' | 'gap' | 'optimized';

export interface BusinessProcess {
  id: string;
  name: string;
  owner: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
  activities: ProcessActivity[];
  kpis: ProcessKPI[];
  risks: string[];
  controls: string[];
  cycleTimeHours: number;
  automationPercent: number;
  isoCompliance: ProcessFramework[];
}

export interface ProcessActivity {
  id: string;
  name: string;
  type: 'manual' | 'automated' | 'decision' | 'subprocess' | 'event';
  responsible: string;
  durationMinutes: number;
  automatable: boolean;
  waste: WasteType[];
  valueAdded: boolean;
}

export interface ProcessKPI {
  name: string;
  formula: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  trend: 'improving' | 'stable' | 'degrading';
  isoReference: string;
}

export interface GapAnalysis {
  framework: ProcessFramework;
  currentMaturity: MaturityLevel;
  targetMaturity: MaturityLevel;
  gaps: Array<{
    area: string;
    currentState: string;
    targetState: string;
    gap: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    effortWeeks: number;
    benefit: string;
  }>;
  roadmap: Array<{ phase: number; actions: string[]; durationWeeks: number; milestone: string }>;
}

export interface ValueStreamMap {
  productFamily: string;
  customerDemand: string;
  totalCycleTime: number;
  totalLeadTime: number;
  valueAddedTime: number;
  processEfficiency: number;
  steps: Array<{ name: string; cycleTime: number; waitTime: number; processEfficiency: number; valueAdded: boolean }>;
  kaizens: string[];
}

export interface ISOComplianceCheck {
  framework: ProcessFramework;
  clauses: Array<{
    clause: string;
    title: string;
    status: 'compliant' | 'partial' | 'non-compliant' | 'na';
    evidence: string;
    corrective_action?: string;
    deadline?: Date;
  }>;
  overallScore: number;
  certificationReady: boolean;
  criticalGaps: string[];
}
