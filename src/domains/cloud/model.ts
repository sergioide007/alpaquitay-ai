/**
 * Cloud Infrastructure Domain Model
 * ISO/IEC 27017 (Cloud Security) · ISO/IEC 27018 (PII in Cloud)
 * CSA STAR · AWS WAF · Azure WAF · GCP CAF
 */

export type CloudProvider = 'aws' | 'azure' | 'gcp' | 'multi-cloud' | 'hybrid';
export type CloudService = 'compute' | 'storage' | 'database' | 'network' | 'serverless' | 'containers' | 'ai-ml' | 'security' | 'devops' | 'monitoring';
export type WellArchitectedPillar = 'operational-excellence' | 'security' | 'reliability' | 'performance' | 'cost' | 'sustainability';
export type IaCTool = 'terraform' | 'pulumi' | 'cdk' | 'bicep' | 'cloudformation' | 'ansible';

export interface CloudArchitectureDesign {
  provider: CloudProvider;
  region: string;
  multiRegion: boolean;
  services: Array<{ service: CloudService; name: string; sku: string; justification: string }>;
  networkDesign: { vpcCidr: string; subnets: string[]; natGateway: boolean; vpn: boolean };
  disasterRecovery: { rto: string; rpo: string; strategy: 'backup' | 'pilot-light' | 'warm-standby' | 'multi-site' };
  securityControls: string[];
  estimatedMonthlyCost: number;
}

export interface WellArchitectedReview {
  pillar: WellArchitectedPillar;
  score: number;
  risks: Array<{ question: string; risk: 'high' | 'medium' | 'low'; remediation: string }>;
  improvementPlan: string[];
}

export interface CostOptimizationPlan {
  currentMonthlyCost: number;
  projectedMonthlyCost: number;
  savingsPercent: number;
  recommendations: Array<{
    resource: string;
    action: 'rightsize' | 'reserve' | 'spot' | 'delete' | 'schedule';
    currentCost: number;
    projectedCost: number;
    effort: 'low' | 'medium' | 'high';
  }>;
}

export interface CloudMigrationPlan {
  strategy: '6R' | '5R';
  phases: Array<{
    name: string;
    workloads: string[];
    migrationPattern: 'rehost' | 'replatform' | 'refactor' | 'repurchase' | 'retire' | 'retain';
    effort: string;
    risk: string;
  }>;
  totalEffortWeeks: number;
  prerequisites: string[];
}

export interface IaCModule {
  tool: IaCTool;
  provider: CloudProvider;
  resourceType: string;
  code: string;
  variables: Record<string, { type: string; description: string; default?: string }>;
  outputs: Record<string, { description: string; value: string }>;
}
