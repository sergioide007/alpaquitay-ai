/**
 * DevOps Domain Model
 * DORA Metrics · ISO/IEC 20000-1 (IT Service Management) · ITIL v4
 */

export type PipelineStage = 'source' | 'build' | 'test' | 'scan' | 'package' | 'deploy' | 'verify' | 'monitor';
export type Environment = 'dev' | 'qa' | 'staging' | 'production';
export type DeploymentStrategy = 'rolling' | 'blue-green' | 'canary' | 'recreate' | 'a-b';
export type AlertSeverity = 'page' | 'critical' | 'warning' | 'info';

export interface CIPipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
  triggers: ('push' | 'pr' | 'schedule' | 'manual')[];
  estimatedDurationMinutes: number;
  parallelJobs: number;
  qualityGates: string[];
  isSelfHealing: boolean;
}

export interface DORAMetrics {
  deploymentFrequency: 'on-demand' | 'daily' | 'weekly' | 'monthly' | 'less-than-monthly';
  leadTimeForChanges: 'less-1h' | 'less-1d' | 'less-1w' | 'less-1m' | 'more-6m';
  changeFailureRate: number;
  meanTimeToRestore: 'less-1h' | 'less-1d' | 'less-1w' | 'more-1w';
  performanceTier: 'elite' | 'high' | 'medium' | 'low';
}

export interface DeploymentPlan {
  strategy: DeploymentStrategy;
  environment: Environment;
  healthChecks: string[];
  rollbackTriggers: string[];
  trafficShiftPercentages?: number[];
  observabilityChecks: string[];
  estimatedDowntimeSeconds: number;
}

export interface IncidentResponse {
  id: string;
  severity: AlertSeverity;
  title: string;
  runbook: string[];
  escalationPath: string[];
  postMortemTemplate: string;
  sloImpact: string;
  mttrTargetMinutes: number;
}

export interface InfrastructureAsCode {
  tool: 'terraform' | 'pulumi' | 'cdk' | 'bicep' | 'cloudformation';
  provider: 'aws' | 'azure' | 'gcp' | 'on-premise';
  modules: string[];
  stateBackend: string;
  generatedCode: string;
}
