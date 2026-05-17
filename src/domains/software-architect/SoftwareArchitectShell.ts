/**
 * Software Architect Domain Agent Shell
 * ISO/IEC 42010 · TOGAF ADM · ArchiMate 3.2 · C4 Model
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class SoftwareArchitectShell extends BaseDomainShell {
  readonly domainId: DomainId = 'software-architect';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'assess-architecture':         this.assessArchitecture.bind(this),
      'create-adr':                  this.createADR.bind(this),
      'generate-c4':                 this.generateC4.bind(this),
      'build-tech-radar':            this.buildTechRadar.bind(this),
      'evaluate-quality-attributes': this.evaluateQualityAttributes.bind(this),
      'interactive-diagram':         this.generateInteractiveDiagram.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;
    if (Array.isArray(o?.risks) && (o.risks as unknown[]).some((r: unknown) => (r as Record<string, unknown>)?.impact === 'high' && (r as Record<string, unknown>)?.likelihood === 'high')) {
      results.push({ severity: 'warn', rule: 'SA-001', message: 'High-impact high-likelihood architectural risk detected — escalate before proceeding.' });
    }
    return results;
  }

  private async assessArchitecture(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const context = String(params.context ?? '');
    const raw = await this.ask(`You are a senior software architect (ISO/IEC 42010, TOGAF).
Assess this architecture: "${context}".
Return JSON: {currentStyle, qualityScores:{scalability,reliability,security,performance,maintainability}(0-100 each), risks:[{risk,likelihood,impact,mitigation}], evolutionPath[], recommendedStyle, migrationRoadmap[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async createADR(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const context   = String(params.context ?? '');
    const decision  = String(params.decision ?? '');
    const raw = await this.ask(`Create an Architecture Decision Record (ISO/IEC 42010).
Context: ${context}. Decision considered: ${decision}.
Return JSON: {id,title,status:'proposed',context,decision,consequences,alternatives[],qualityAttributes[],isoReference}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async generateC4(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const level   = String(params.level ?? 'context');
    const system  = String(params.system ?? '');
    const raw = await this.ask(`Generate a C4 model ${level} diagram for: "${system}".
Return JSON: {level,title,elements:[{id,type,name,technology,description}],relationships:[{from,to,label,technology}]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async buildTechRadar(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const context = String(params.context ?? '');
    const raw = await this.ask(`Build a Technology Radar for: "${context}".
Return JSON: {adopt:[{name,category,rationale,riskLevel}],trial:[...],assess:[...],hold:[...]}.
Categories: languages, frameworks, platforms, tools, techniques.`);
    return { success: true, data: this.parseJSON(raw, { adopt: [], trial: [], assess: [], hold: [] }) };
  }

  private async evaluateQualityAttributes(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const requirements = String(params.requirements ?? '');
    const raw = await this.ask(`Evaluate quality attributes (ISO/IEC 25010) for: "${requirements}".
Return JSON: {attributes:[{name,currentScore,targetScore,tactics[],tradeoffs[]}], conflictingAttributes[], prioritizationRationale}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async generateInteractiveDiagram(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const instruction = String(params.instruction ?? '');
    const current = params.currentDiagram as { nodes: Array<{ id: string; type: string; name: string }>; edges: Array<{ from: string; to: string; label?: string }> } | undefined;
    const hasNodes = Array.isArray(current?.nodes) && current!.nodes.length > 0;

    const diagramCtx = hasNodes
      ? `Current diagram — nodes: ${current!.nodes.map(n => `${n.name}(${n.type})`).join(', ')}. Connections: ${current!.edges.map(e => { const f = current!.nodes.find(n => n.id === e.from)?.name ?? e.from; const t = current!.nodes.find(n => n.id === e.to)?.name ?? e.to; return `${f}→${t}${e.label ? `(${e.label})` : ''}`; }).join(', ')}.`
      : 'Starting from an empty canvas.';

    const raw = await this.ask(`You are a senior software architect (ISO/IEC 42010, TOGAF, C4 Model).
${diagramCtx}
Instruction: "${instruction}"

Node types: lambda, function, api, db, storage, queue, cache, service, client, auth, cdn, container
Node: { "id": "slug", "type": "<type>", "name": "Max 16 chars", "x": <number>, "y": <number> }
Edge: { "id": "slug", "from": "<node-id>", "to": "<node-id>", "label": "optional" }
Layout: start x=100 y=80, space 200px horizontally, 150px vertically, flow left-to-right.

Return ONLY valid JSON (no markdown):
{ "explanation": "one-sentence description", "diagram": { "nodes": [...], "edges": [...] } }`, 2048);

    return { success: true, data: this.parseJSON(raw, { explanation: 'Diagram updated.', diagram: null }) };
  }
}
