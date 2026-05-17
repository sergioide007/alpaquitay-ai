/**
 * Orchestrator Agent — Routes objectives to specialist Domain Agent Shells
 * and coordinates multi-agent workflows.
 *
 * Responsibilities:
 *   1. Parse incoming objective into sub-tasks
 *   2. Score agent relevance (AgentRegistry.scoreRelevance)
 *   3. Assign sub-tasks to agents (MetaheuristicEngine.optimizePlan)
 *   4. Execute tasks (sequentially or in parallel per dependency graph)
 *   5. Aggregate results into a unified response
 *   6. Apply guardrails on aggregated output
 *
 * Does NOT talk to the AI directly — it delegates ALL AI calls to domain shells.
 * Does NOT bypass PrivacyGuard — all params are sanitized before dispatch.
 *
 * ArchiMate: Application Collaboration
 * TOGAF Phase C: Application Architecture — orchestration pattern
 * BIAN: Service Orchestration
 */

import type { AIProvider }       from '../../core/interfaces';
import type { DomainId, DomainResult, GuardrailResult } from '../interfaces/DomainAgentShell';
import { AgentRegistry } from './AgentRegistry';
import { MetaheuristicEngine }  from './metaheuristic/MetaheuristicEngine';
import { PrivacyGuard }         from './privacy/PrivacyGuard';
import { TaskGene }             from './metaheuristic/GeneticOptimizer';
import { randomUUID }           from 'crypto';

export interface OrchestratedTask {
  taskId: string;
  description: string;
  domainId: DomainId;
  useCaseId: string;
  params: Record<string, unknown>;
  dependsOn: string[];
  estimatedMs: number;
  canParallelize: boolean;
}

export interface ExecutionPlan {
  objective: string;
  tasks: OrchestratedTask[];
  algorithm: string;
  estimatedTotalMs: number;
}

export interface OrchestratorResult {
  objective: string;
  plan: ExecutionPlan;
  taskResults: Array<{ task: OrchestratedTask; result: DomainResult }>;
  aggregatedOutput: string;
  guardrailResults: GuardrailResult[];
  elapsedMs: number;
  privacyReport: { piiFound: boolean; riskLevel: string };
}

export class OrchestratorAgent {
  private readonly registry  = new AgentRegistry();
  private readonly privacy   = new PrivacyGuard();
  private metaheuristic!:      MetaheuristicEngine;
  private provider!:           AIProvider;
  private workspacePath!:      string;

  async initialize(provider: AIProvider, workspacePath: string): Promise<void> {
    this.provider      = provider;
    this.workspacePath = workspacePath;
    this.metaheuristic = new MetaheuristicEngine(provider, { maxGenerations: 30 });
  }

  /**
   * Main entry point: receive a natural-language objective, plan and execute it.
   */
  async execute(objective: string, contextParams: Record<string, unknown> = {}): Promise<OrchestratorResult> {
    const start = Date.now();

    // 1. Privacy sanitization of the objective
    const privacyReport = this.privacy.sanitize(objective);
    const safeObjective = privacyReport.sanitizedText;
    const safeParams    = this.privacy.redactObject(contextParams);

    // 2. Decompose objective into tasks
    const tasks = await this.decomposeObjective(safeObjective, safeParams);

    // 3. Optimize execution plan
    const genes: TaskGene[] = tasks.map(t => ({
      taskId:           t.taskId,
      description:      t.description,
      assignedDomainId: t.domainId,
      useCaseId:        t.useCaseId,
      params:           t.params,
      dependsOn:        t.dependsOn,
      estimatedMs:      t.estimatedMs,
      canParallelize:   t.canParallelize,
    }));

    const allAgents = this.registry.getAll();
    const optResult = this.metaheuristic.optimizePlan(genes, allAgents);

    const plan: ExecutionPlan = {
      objective: safeObjective,
      tasks:     optResult.bestPlan.map(g => ({ ...g, domainId: g.assignedDomainId })) as OrchestratedTask[],
      algorithm: optResult.algorithm,
      estimatedTotalMs: optResult.bestPlan.reduce((s, t) => s + t.estimatedMs, 0),
    };

    // 4. Execute tasks respecting dependency graph
    const taskResults = await this.executePlan(plan);

    // 5. Aggregate and synthesize
    const aggregatedOutput = this.aggregate(objective, taskResults);

    // 6. Collect all guardrail results
    const guardrailResults = taskResults.flatMap(r => r.result.guardrailResults ?? []);

    return {
      objective,
      plan,
      taskResults,
      aggregatedOutput,
      guardrailResults,
      elapsedMs: Date.now() - start,
      privacyReport: { piiFound: privacyReport.piiFound, riskLevel: privacyReport.riskLevel },
    };
  }

  private async decomposeObjective(
    objective: string,
    params: Record<string, unknown>,
  ): Promise<OrchestratedTask[]> {
    const relevantAgents = this.registry.scoreRelevance(objective).slice(0, 4);

    if (relevantAgents.length === 0) {
      return [{
        taskId:         randomUUID(),
        description:    objective,
        domainId:       'software-engineer',
        useCaseId:      'review-code',
        params:         params as Record<string, unknown>,
        dependsOn:      [],
        estimatedMs:    3000,
        canParallelize: false,
      }];
    }

    // Use AI to decompose into structured sub-tasks
    const agentList = relevantAgents.map(r => `${r.descriptor.domainId}: ${r.descriptor.capabilities.map(c => c.useCaseId).join(', ')}`).join('\n');
    const prompt = `You are a task orchestrator. Decompose this objective into concrete sub-tasks.
Objective: "${objective}"
Available agents and use cases:
${agentList}

Return a JSON array of tasks:
[{
  "description": string,
  "domainId": string (one of the available agents),
  "useCaseId": string (one of the agent's use cases),
  "params": {},
  "dependsOn": [] (taskIds that must complete first),
  "estimatedMs": number,
  "canParallelize": boolean
}]
Only return the JSON array.`;

    const raw = await this.provider.complete(prompt, { maxTokens: 800 });
    try {
      const parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()) as Array<Omit<OrchestratedTask, 'taskId'>>;
      return parsed.map(t => ({ ...t, taskId: randomUUID() }));
    } catch {
      return relevantAgents.slice(0, 2).map(r => ({
        taskId:         randomUUID(),
        description:    `${r.descriptor.name}: ${objective}`,
        domainId:       r.descriptor.domainId,
        useCaseId:      r.descriptor.capabilities[0].useCaseId,
        params:         params as Record<string, unknown>,
        dependsOn:      [],
        estimatedMs:    3000,
        canParallelize: true,
      }));
    }
  }

  private async executePlan(plan: ExecutionPlan): Promise<Array<{ task: OrchestratedTask; result: DomainResult }>> {
    const completed = new Map<string, DomainResult>();
    const results: Array<{ task: OrchestratedTask; result: DomainResult }> = [];

    const remaining = [...plan.tasks];

    while (remaining.length > 0) {
      const ready = remaining.filter(t => t.dependsOn.every(d => completed.has(d)));
      if (ready.length === 0) break;

      const parallel   = ready.filter(t => t.canParallelize);
      const sequential = ready.filter(t => !t.canParallelize);
      const batch      = parallel.length > 0 ? parallel : [sequential[0]];

      const batchResults = await Promise.all(
        batch.map(async task => {
          const shell = await this.registry.getInstance(task.domainId, this.provider, this.workspacePath);
          const result = await shell.run(task.useCaseId, task.params);
          return { task, result };
        }),
      );

      for (const r of batchResults) {
        completed.set(r.task.taskId, r.result);
        results.push(r);
        remaining.splice(remaining.indexOf(r.task), 1);
      }
    }

    return results;
  }

  private aggregate(
    objective: string,
    taskResults: Array<{ task: OrchestratedTask; result: DomainResult }>,
  ): string {
    const successful = taskResults.filter(r => r.result.success);
    const lines = [
      `## Orchestration Result`,
      `**Objective:** ${objective}`,
      `**Tasks completed:** ${successful.length}/${taskResults.length}`,
      '',
      ...successful.map(r => `### ${r.task.description} (${r.task.domainId})\n${JSON.stringify(r.result.data, null, 2)}`),
    ];
    const failed = taskResults.filter(r => !r.result.success);
    if (failed.length > 0) {
      lines.push('\n### Failed Tasks');
      failed.forEach(r => lines.push(`- ${r.task.description}: ${r.result.errors?.join(', ')}`));
    }
    return lines.join('\n');
  }
}
