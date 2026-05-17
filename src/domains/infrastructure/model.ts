/**
 * Infrastructure Domain Model
 * ITIL v4 · ISO/IEC 20000-1 · ISO 22301 (Business Continuity)
 */

export type InfraComponent = 'server' | 'network' | 'storage' | 'database' | 'loadbalancer' | 'firewall' | 'dns' | 'cdn';
export type SLATier = 'platinum' | 'gold' | 'silver' | 'bronze';
export type CapacityTrend = 'stable' | 'growing' | 'shrinking' | 'volatile';

export interface CapacityPlan {
  horizon: '3m' | '6m' | '12m' | '24m';
  components: Array<{
    component: InfraComponent;
    currentUtilization: number;
    projectedUtilization: number;
    trend: CapacityTrend;
    actionRequired: boolean;
    recommendation: string;
    estimatedCost: number;
  }>;
  totalInvestmentRequired: number;
  riskIfUnaddressed: string;
}

export interface SLAContract {
  tier: SLATier;
  availabilityPercent: number;
  rto: string;
  rpo: string;
  maintenanceWindows: string[];
  penaltyTerms: string;
  escalationMatrix: Array<{ level: number; contact: string; responseTime: string }>;
}

export interface NetworkTopology {
  type: 'star' | 'mesh' | 'hybrid' | 'ring';
  segments: Array<{ name: string; cidr: string; vlan: number; purpose: string }>;
  firewallRules: Array<{ from: string; to: string; port: string; protocol: string; action: 'allow'|'deny' }>;
  redundancyLevel: 'single' | 'n+1' | 'n+n';
  bandwidthMbps: number;
}

export interface DisasterRecoveryPlan {
  rto: number;
  rpo: number;
  tier: 'tier1_mission_critical' | 'tier2_business_critical' | 'tier3_important' | 'tier4_normal';
  recoverySteps: string[];
  testSchedule: 'monthly' | 'quarterly' | 'annually';
  lastTestDate?: Date;
  lastTestResult?: 'pass' | 'fail' | 'partial';
  iso22301Compliant: boolean;
}

export interface MonitoringConfiguration {
  metrics: Array<{ name: string; threshold: number; unit: string; alertOn: 'above'|'below'; severity: 'page'|'warn'|'info' }>;
  dashboards: string[];
  retentionDays: number;
  anomalyDetection: boolean;
  sloTargets: Array<{ sli: string; target: number; window: string }>;
}
