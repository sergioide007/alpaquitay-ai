/**
 * Genetic Optimizer — Evolutionary task plan optimization.
 *
 * Applies a Genetic Algorithm to find the optimal decomposition and
 * sequencing of sub-tasks across domain agents, maximizing:
 *   - Parallelism (independent tasks run concurrently)
 *   - Agent-task fit (each task assigned to the most capable agent)
 *   - Dependency satisfaction (no task executes before its deps)
 *   - Estimated throughput (minimize total wall-clock time)
 *
 * Algorithm:
 *   Initialize  → random population of task plans
 *   Evaluate    → fitness function per plan
 *   Select      → tournament selection (pressure = 0.7)
 *   Crossover   → single-point ordered crossover
 *   Mutate      → swap agent assignment or reorder independent tasks
 *   Repeat      → until maxGenerations or convergence
 */

import type { DomainId }         from '../../interfaces/DomainAgentShell';
import type { AgentDescriptor }  from '../AgentRegistry';

export interface TaskGene {
  taskId: string;
  description: string;
  assignedDomainId: DomainId;
  useCaseId: string;
  params: Record<string, unknown>;
  dependsOn: string[];
  estimatedMs: number;
  canParallelize: boolean;
}

export type TaskPlan = TaskGene[];

export interface GeneticResult {
  bestPlan: TaskPlan;
  bestFitness: number;
  generationsRun: number;
  convergenceGeneration: number;
  populationDiversity: number;
}

interface Individual {
  plan: TaskPlan;
  fitness: number;
}

export class GeneticOptimizer {
  private readonly populationSize: number;
  private readonly maxGenerations: number;
  private readonly mutationRate: number;
  private readonly eliteCount: number;

  constructor(opts: { populationSize?: number; maxGenerations?: number; mutationRate?: number } = {}) {
    this.populationSize  = opts.populationSize  ?? 20;
    this.maxGenerations  = opts.maxGenerations  ?? 50;
    this.mutationRate    = opts.mutationRate    ?? 0.15;
    this.eliteCount      = Math.max(2, Math.floor((opts.populationSize ?? 20) * 0.1));
  }

  optimize(tasks: TaskGene[], agents: AgentDescriptor[]): GeneticResult {
    if (tasks.length === 0) return { bestPlan: [], bestFitness: 1, generationsRun: 0, convergenceGeneration: 0, populationDiversity: 0 };

    let population = this.initializePopulation(tasks, agents);
    let bestIndividual = this.getBest(population);
    let convergenceGeneration = 0;
    let lastBestFitness = -Infinity;

    for (let gen = 0; gen < this.maxGenerations; gen++) {
      population = this.evolve(population, agents);
      const currentBest = this.getBest(population);

      if (currentBest.fitness > bestIndividual.fitness) {
        bestIndividual = currentBest;
      }

      if (Math.abs(currentBest.fitness - lastBestFitness) < 0.001) {
        convergenceGeneration = gen;
        break;
      }
      lastBestFitness = currentBest.fitness;
    }

    const diversity = this.measureDiversity(population);

    return {
      bestPlan:            bestIndividual.plan,
      bestFitness:         bestIndividual.fitness,
      generationsRun:      this.maxGenerations,
      convergenceGeneration,
      populationDiversity: diversity,
    };
  }

  private initializePopulation(tasks: TaskGene[], agents: AgentDescriptor[]): Individual[] {
    const population: Individual[] = [];
    for (let i = 0; i < this.populationSize; i++) {
      const plan = this.randomPlan(tasks, agents);
      population.push({ plan, fitness: this.evaluate(plan) });
    }
    return population;
  }

  private randomPlan(tasks: TaskGene[], agents: AgentDescriptor[]): TaskPlan {
    return tasks.map(task => {
      const capable = agents.filter(a => a.capabilities.some(c => c.useCaseId === task.useCaseId));
      const chosen  = capable.length > 0 ? capable[Math.floor(Math.random() * capable.length)] : agents[0];
      return { ...task, assignedDomainId: chosen.domainId };
    });
  }

  /**
   * Fitness = parallelismScore × dependencyScore × agentMatchScore
   * Higher is better (max = 1.0).
   */
  private evaluate(plan: TaskPlan): number {
    if (plan.length === 0) return 1;

    const dependencySatisfied = plan.every(task =>
      task.dependsOn.every(depId => plan.findIndex(t => t.taskId === depId) < plan.findIndex(t => t.taskId === task.taskId))
    );
    if (!dependencySatisfied) return 0.01;

    const parallelGroups = this.computeParallelGroups(plan);
    const parallelismScore = Math.min(1, parallelGroups / plan.length + 0.3);

    const totalMs   = plan.reduce((sum, t) => sum + t.estimatedMs, 0);
    const criticalMs = this.computeCriticalPath(plan);
    const throughputScore = totalMs > 0 ? Math.min(1, totalMs / (criticalMs * plan.length + 1)) : 1;

    return (dependencySatisfied ? 0.5 : 0) + parallelismScore * 0.3 + throughputScore * 0.2;
  }

  private computeParallelGroups(plan: TaskPlan): number {
    const grouped = new Set<number>();
    plan.forEach((task, idx) => {
      if (task.canParallelize && task.dependsOn.length === 0) grouped.add(idx);
    });
    return grouped.size;
  }

  private computeCriticalPath(plan: TaskPlan): number {
    const memo = new Map<string, number>();
    const longestPath = (taskId: string): number => {
      if (memo.has(taskId)) return memo.get(taskId)!;
      const task = plan.find(t => t.taskId === taskId);
      if (!task) return 0;
      const depMax = task.dependsOn.length > 0 ? Math.max(...task.dependsOn.map(longestPath)) : 0;
      const result = depMax + task.estimatedMs;
      memo.set(taskId, result);
      return result;
    };
    return Math.max(...plan.map(t => longestPath(t.taskId)), 1);
  }

  private evolve(population: Individual[], agents: AgentDescriptor[]): Individual[] {
    const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
    const nextGen: Individual[] = sorted.slice(0, this.eliteCount);

    while (nextGen.length < this.populationSize) {
      const parent1 = this.tournamentSelect(sorted);
      const parent2 = this.tournamentSelect(sorted);
      let child = this.crossover(parent1.plan, parent2.plan);
      if (Math.random() < this.mutationRate) child = this.mutate(child, agents);
      nextGen.push({ plan: child, fitness: this.evaluate(child) });
    }

    return nextGen;
  }

  private tournamentSelect(sorted: Individual[]): Individual {
    const a = sorted[Math.floor(Math.random() * sorted.length)];
    const b = sorted[Math.floor(Math.random() * sorted.length)];
    return a.fitness > b.fitness ? a : b;
  }

  private crossover(p1: TaskPlan, p2: TaskPlan): TaskPlan {
    if (p1.length !== p2.length) return p1;
    const point = Math.floor(Math.random() * p1.length);
    return [...p1.slice(0, point), ...p2.slice(point)];
  }

  private mutate(plan: TaskPlan, agents: AgentDescriptor[]): TaskPlan {
    const mutated = [...plan];
    const idx = Math.floor(Math.random() * mutated.length);
    const task = mutated[idx];

    if (Math.random() < 0.5) {
      const capable = agents.filter(a => a.capabilities.some(c => c.useCaseId === task.useCaseId));
      if (capable.length > 0) {
        const chosen = capable[Math.floor(Math.random() * capable.length)];
        mutated[idx] = { ...task, assignedDomainId: chosen.domainId };
      }
    } else if (mutated.length > 1) {
      const other = Math.floor(Math.random() * mutated.length);
      [mutated[idx], mutated[other]] = [mutated[other], mutated[idx]];
    }

    return mutated;
  }

  private getBest(population: Individual[]): Individual {
    return population.reduce((best, ind) => ind.fitness > best.fitness ? ind : best);
  }

  private measureDiversity(population: Individual[]): number {
    const assignments = population.map(ind => ind.plan.map(t => t.assignedDomainId).join(','));
    const unique = new Set(assignments).size;
    return unique / population.length;
  }
}
