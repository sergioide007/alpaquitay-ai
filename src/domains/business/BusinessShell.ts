/**
 * Business Expert Domain Agent Shell
 *
 * Autonomous agent for business model design, strategic analysis,
 * financial modeling, OKR definition, market analysis, and business cases.
 *
 * Standards:
 *   ISO 56002:2019  — Innovation Management System
 *   ISO 9001:2015   — Quality management (process orientation)
 *   Balanced Scorecard (Kaplan & Norton)
 *   OKR Framework (John Doerr / Google)
 *   Business Model Canvas (Osterwalder)
 *   Porter's Five Forces / Value Chain
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult }  from '../interfaces/DomainAgentShell';

export class BusinessShell extends BaseDomainShell {
  readonly domainId: DomainId = 'business';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'design-business-model': this.designBusinessModel.bind(this),
      'strategic-analysis':    this.strategicAnalysis.bind(this),
      'define-okrs':           this.defineOKRs.bind(this),
      'financial-model':       this.financialModel.bind(this),
      'market-analysis':       this.marketAnalysis.bind(this),
      'build-business-case':   this.buildBusinessCase.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;

    const unitEcon = o?.unitEconomics as Record<string, number> | undefined;
    if (unitEcon?.ltvCacRatio !== undefined && unitEcon.ltvCacRatio < 3) {
      results.push({
        severity: 'warn',
        rule: 'BIZ-001',
        message: `LTV:CAC ratio is ${unitEcon.ltvCacRatio.toFixed(1)}x — below the 3:1 minimum for sustainable growth. Revisit CAC or pricing.`,
      });
    }
    if (o?.runway !== undefined && Number(o.runway) < 6) {
      results.push({
        severity: 'block',
        rule: 'BIZ-002',
        message: `Runway is ${o.runway} months — below 6-month survival threshold. Immediate fundraising or cost reduction required.`,
      });
    }
    if (o?.roi !== undefined && Number(o.roi) < 0) {
      results.push({
        severity: 'warn',
        rule: 'BIZ-003',
        message: 'Negative ROI in business case — investment destroys value. Re-examine assumptions or reject proposal.',
      });
    }
    return results;
  }

  private async designBusinessModel(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const idea  = String(params.idea ?? '');
    const stage = String(params.stage ?? 'mvp');
    const raw = await this.ask(`You are a business model expert (ISO 56002 Innovation Management).
Design a Business Model Canvas for: "${idea}". Stage: ${stage}.
Return JSON: {valuePropositions[],customerSegments[],channels[],customerRelationships[],revenueStreams:[{type,model,percentage}],keyResources[],keyActivities[],keyPartnerships[],costStructure:[{item,type,percentage}],unfairAdvantage,pattern,leanCanvas:{problem[],solution[],uniqueValueProp,channels[],customerSegments[],earlyAdopters[],existingAlternatives[],metrics[]}}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async strategicAnalysis(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const company   = String(params.company ?? '');
    const framework = String(params.framework ?? 'swot');
    const raw = await this.ask(`Perform a ${framework.toUpperCase()} strategic analysis for: "${company}".
Return JSON: {framework,findings:{strengths[],weaknesses[],opportunities[],threats[]},strategicInsights[],prioritizedOpportunities:[{opportunity,impact,effort,timeframe}],risksToWatch[],recommendedStrategy,strategicOptions:[{option,rationale,investmentRequired,timelineMonths}]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async defineOKRs(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const mission = String(params.mission ?? '');
    const quarter = String(params.quarter ?? 'Q1 2026');
    const level   = String(params.level ?? 'company');
    const raw = await this.ask(`Define ${level}-level OKRs (John Doerr framework) for ${quarter}: "${mission}".
Return JSON: {cycle,okrs:[{objective,keyResults:[{description,metric,baseline,target,unit,confidence(0-100)}],initiatives[],owner}],alignmentPrinciples[],cadence,reviewMechanism}.`);
    return { success: true, data: this.parseJSON(raw, { okrs: [] }) };
  }

  private async financialModel(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const business   = String(params.business ?? '');
    const scenario   = String(params.scenario ?? 'base');
    const months     = Number(params.months ?? 24);
    const raw = await this.ask(`Build a ${scenario} financial model for ${months} months: "${business}".
Return JSON: {scenario,revenueProjections:[{month,mrr,arr,customers}],unitEconomics:{cac,ltv,ltvCacRatio,paybackMonths,grossMargin},burnRate,runway,breakEvenMonth,fundingRequired,keyAssumptions[],sensitivityAnalysis:[{variable,pessimistic,base,optimistic}]}.`);
    return { success: true, data: this.parseJSON(raw, { unitEconomics: { ltvCacRatio: 0 } }) };
  }

  private async marketAnalysis(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const market = String(params.market ?? '');
    const region = String(params.region ?? 'global');
    const raw = await this.ask(`Analyze the ${region} market for: "${market}".
TAM/SAM/SOM sizing, competitive landscape (Porter's Five Forces), trends, barriers.
Return JSON: {tam,sam,som,growthRate,competitors:[{name,strengths[],weaknesses[],marketShare}],trends[],entryBarriers[],differentiators[],goToMarketStrategy,porterAnalysis:{rivalry,buyerPower,supplierPower,newEntrants,substitutes}}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async buildBusinessCase(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const initiative = String(params.initiative ?? '');
    const budget     = String(params.budget ?? '');
    const raw = await this.ask(`Build a business case for: "${initiative}". Budget: ${budget}.
Return JSON: {title,executiveSummary,problemStatement,proposedSolution,stakeholders:[{name,role,interest,influence}],costBenefitAnalysis:{costs:[{item,amount}],benefits:[{item,value,type}]},roi,paybackPeriodMonths,risks:[{risk,probability(0-1),impact(0-1),mitigation}],recommendation,implementationRoadmap[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }
}
