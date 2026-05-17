/**
 * Metaheuristic Engine — Unified interface to all algorithmic optimization.
 *
 * Combines:
 *   GeneticOptimizer   → task plan optimization (which agents, in which order)
 *   RecursiveRefinement → output quality improvement (iterative self-correction)
 *   SimulatedAnnealing → agent assignment search (escape local optima)
 *
 * The CentralBrainAgent uses this engine transparently — it calls
 * optimizePlan() and refineOutput() without knowing which algorithm runs.
 *
 * Metaheuristic selection policy:
 *   n_tasks ≤ 3  → greedy assignment (no optimization overhead)
 *   n_tasks ≤ 10 → Genetic Algorithm (fast, good diversity)
 *   n_tasks > 10 → Simulated Annealing (scales better for large search spaces)
 */

import type { AIProvider }        from '../../../core/interfaces';
import type { AgentDescriptor }   from '../AgentRegistry';
import { GeneticOptimizer, TaskGene, GeneticResult } from './GeneticOptimizer';
import { RecursiveRefinement, RefinementRubric, RefinementResult } from './RecursiveRefinement';

export interface OptimizationResult extends GeneticResult {
  algorithm: 'greedy' | 'genetic' | 'simulated-annealing';
  elapsedMs: number;
}

export class MetaheuristicEngine {
  private readonly refinement: RecursiveRefinement;

  constructor(
    private readonly provider: AIProvider,
    private readonly opts: { maxGenerations?: number; maxRefinementIterations?: number } = {},
  ) {
    this.refinement = new RecursiveRefinement(provider, opts.maxRefinementIterations ?? 3);
  }

  /**
   * Find the optimal task execution plan given available agents.
   * Selects algorithm based on problem size.
   */
  optimizePlan(tasks: TaskGene[], agents: AgentDescriptor[]): OptimizationResult {
    const start = Date.now();

    if (tasks.length <= 3) {
      const plan = this.greedyAssign(tasks, agents);
      return { bestPlan: plan, bestFitness: 1, generationsRun: 0, convergenceGeneration: 0, populationDiversity: 0, algorithm: 'greedy', elapsedMs: Date.now() - start };
    }

    if (tasks.length <= 10) {
      const ga = new GeneticOptimizer({ populationSize: 20, maxGenerations: this.opts.maxGenerations ?? 50 });
      const result = ga.optimize(tasks, agents);
      return { ...result, algorithm: 'genetic', elapsedMs: Date.now() - start };
    }

    const sa = this.simulatedAnnealing(tasks, agents);
    return { ...sa, algorithm: 'simulated-annealing', elapsedMs: Date.now() - start };
  }

  /**
   * Recursively refine an AI output until quality threshold is met.
   */
  async refineOutput(output: string, task: string, rubric: RefinementRubric): Promise<RefinementResult> {
    return this.refinement.refine(output, task, rubric);
  }

  /**
   * Greedy assignment: each task goes to its most keyword-matching agent.
   */
  private greedyAssign(tasks: TaskGene[], agents: AgentDescriptor[]): TaskGene[] {
    return tasks.map(task => {
      const capable = agents.filter(a => a.capabilities.some(c => c.useCaseId === task.useCaseId));
      return { ...task, assignedDomainId: (capable[0] ?? agents[0]).domainId };
    });
  }

  /**
   * Simulated Annealing for large task graphs.
   * State:    agent assignment vector
   * Energy:   inverse fitness (minimize energy = maximize fitness)
   * Schedule: geometric cooling T(k) = T0 × α^k
   */
  private simulatedAnnealing(tasks: TaskGene[], agents: AgentDescriptor[]): GeneticResult {
    const fitness = (plan: TaskGene[]): number => {
      const depOk = plan.every(t => t.dependsOn.every(d => plan.findIndex(p => p.taskId === d) < plan.findIndex(p => p.taskId === t.taskId)));
      if (!depOk) return 0;
      const parallel = plan.filter(t => t.canParallelize && t.dependsOn.length === 0).length;
      return 0.5 + (parallel / plan.length) * 0.5;
    };

    let current = this.greedyAssign(tasks, agents);
    let currentF = fitness(current);
    let best = current;
    let bestF = currentF;

    const T0 = 1.0, alpha = 0.95, maxIterations = 200;

    for (let k = 0; k < maxIterations; k++) {
      const T = T0 * Math.pow(alpha, k);
      const neighbor = this.perturbSA(current, agents);
      const neighborF = fitness(neighbor);
      const delta = neighborF - currentF;

      if (delta > 0 || Math.random() < Math.exp(delta / T)) {
        current  = neighbor;
        currentF = neighborF;
        if (currentF > bestF) { best = current; bestF = currentF; }
      }
    }

    return { bestPlan: best, bestFitness: bestF, generationsRun: maxIterations, convergenceGeneration: maxIterations, populationDiversity: 0.5 };
  }

  private perturbSA(plan: TaskGene[], agents: AgentDescriptor[]): TaskGene[] {
    const perturbed = [...plan];
    const idx = Math.floor(Math.random() * perturbed.length);
    const task = perturbed[idx];
    const capable = agents.filter(a => a.capabilities.some(c => c.useCaseId === task.useCaseId));
    if (capable.length > 0) {
      const chosen = capable[Math.floor(Math.random() * capable.length)];
      perturbed[idx] = { ...task, assignedDomainId: chosen.domainId };
    }
    return perturbed;
  }
}
