/**
 * Marketing Domain Model
 * ISO 10668 (Brand Valuation) · ISO 20121 · IMC Framework
 */

export type Channel = 'email' | 'social-linkedin' | 'social-instagram' | 'social-tiktok' | 'seo' | 'paid-search' | 'content' | 'webinar' | 'event' | 'influencer';
export type FunnelStage = 'awareness' | 'interest' | 'consideration' | 'intent' | 'evaluation' | 'purchase' | 'retention' | 'advocacy';
export type ContentType = 'blog' | 'whitepaper' | 'case-study' | 'video' | 'infographic' | 'webinar' | 'podcast' | 'email-sequence';

export interface CampaignPlan {
  name: string;
  objective: string;
  targetAudience: AudienceSegment;
  channels: Channel[];
  budget: number;
  duration: { start: Date; end: Date };
  kpis: Array<{ metric: string; target: number; unit: string }>;
  contentCalendar: ContentItem[];
  estimatedReach: number;
  estimatedConversions: number;
}

export interface AudienceSegment {
  name: string;
  demographics: { ageRange: string; roles: string[]; industries: string[] };
  psychographics: string[];
  painPoints: string[];
  channels: Channel[];
  buyerPersona: string;
  icp: boolean;
}

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  funnelStage: FunnelStage;
  channel: Channel;
  publishDate: Date;
  keywords: string[];
  callToAction: string;
  estimatedEngagement: number;
}

export interface SEOAnalysis {
  targetKeywords: Array<{ keyword: string; volume: number; difficulty: number; intent: 'informational'|'navigational'|'transactional' }>;
  contentGaps: string[];
  technicalIssues: string[];
  backlinkOpportunities: string[];
  competitorAnalysis: Array<{ competitor: string; strengths: string[]; gaps: string[] }>;
  prioritizedActions: string[];
}

export interface MarketingROI {
  investment: number;
  revenue: number;
  roi: number;
  cac: number;
  ltv: number;
  ltvCacRatio: number;
  paybackPeriodMonths: number;
  channelBreakdown: Array<{ channel: Channel; spend: number; revenue: number; roi: number }>;
}
