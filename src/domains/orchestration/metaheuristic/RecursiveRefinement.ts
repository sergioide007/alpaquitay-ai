/**
 * Recursive Refinement — Self-improving output quality engine.
 *
 * Iteratively refines AI-generated outputs until they meet a quality threshold
 * or exhaust the maximum iteration budget.
 *
 * Algorithm (Recursive / Metaheuristic):
 *   1. Generate initial output (AI call)
 *   2. Evaluate quality via rubric (AI evaluator call)
 *   3. If score ≥ threshold → return (base case)
 *   4. If iterations exhausted → return best so far (base case)
 *   5. Build refinement prompt (delta from current score to target)
 *   6. Generate refined output → recurse from step 2
 *
 * Convergence guarantee: strictly bounded recursion depth (maxIterations).
 * Quality monotonicity: stores best-of-all outputs, not just the last.
 *
 * ISO/IEC 25010 — Quality Characteristic: Accuracy · Reliability
 */

import type { AIProvider } from '../../../core/interfaces';

export interface RefinementRubric {
  /** Criteria and their weights (must sum to 1.0). */
  criteria: Array<{ name: string; description: string; weight: number }>;
  /** Minimum acceptable score (0–100) to stop refinement. */
  threshold: number;
  /** Context injected into the evaluator prompt. */
  domainContext: string;
}

export interface RefinementIteration {
  iteration: number;
  output: string;
  score: number;
  feedback: string;
  improvementDelta: number;
}

export interface RefinementResult {
  finalOutput: string;
  finalScore: number;
  iterations: RefinementIteration[];
  converged: boolean;
  totalIterations: number;
}

export class RecursiveRefinement {
  constructor(
    private readonly provider: AIProvider,
    private readonly maxIterations: number = 3,
  ) {}

  /**
   * Entry point — refines `initialOutput` recursively until quality threshold.
   */
  async refine(
    initialOutput: string,
    originalTask: string,
    rubric: RefinementRubric,
  ): Promise<RefinementResult> {
    const iterations: RefinementIteration[] = [];
    const bestOutput = initialOutput;
    const bestScore  = 0;

    return this.refineRecursive(initialOutput, originalTask, rubric, 0, iterations, bestOutput, bestScore);
  }

  private async refineRecursive(
    currentOutput: string,
    originalTask: string,
    rubric: RefinementRubric,
    depth: number,
    iterations: RefinementIteration[],
    bestOutput: string,
    bestScore: number,
  ): Promise<RefinementResult> {
    // ── Base case: max depth reached ──────────────────────────────────────────
    if (depth >= this.maxIterations) {
      return { finalOutput: bestOutput, finalScore: bestScore, iterations, converged: false, totalIterations: depth };
    }

    // ── Evaluate current output ───────────────────────────────────────────────
    const evaluation = await this.evaluate(currentOutput, originalTask, rubric);
    const iteration: RefinementIteration = {
      iteration:        depth,
      output:           currentOutput,
      score:            evaluation.score,
      feedback:         evaluation.feedback,
      improvementDelta: evaluation.score - bestScore,
    };
    iterations.push(iteration);

    if (evaluation.score > bestScore) {
      bestScore  = evaluation.score;
      bestOutput = currentOutput;
    }

    // ── Base case: quality threshold met ─────────────────────────────────────
    if (evaluation.score >= rubric.threshold) {
      return { finalOutput: bestOutput, finalScore: bestScore, iterations, converged: true, totalIterations: depth + 1 };
    }

    // ── Refinement step ───────────────────────────────────────────────────────
    const refinedOutput = await this.generateRefinement(currentOutput, originalTask, evaluation.feedback, rubric);

    // ── Recursive call (depth + 1) ────────────────────────────────────────────
    return this.refineRecursive(refinedOutput, originalTask, rubric, depth + 1, iterations, bestOutput, bestScore);
  }

  private async evaluate(
    output: string,
    originalTask: string,
    rubric: RefinementRubric,
  ): Promise<{ score: number; feedback: string; criteriaScores: Record<string, number> }> {
    const criteriaText = rubric.criteria.map(c => `- ${c.name} (weight: ${c.weight}): ${c.description}`).join('\n');
    const prompt = `You are a quality evaluator. Score this output against the rubric.
Domain context: ${rubric.domainContext}
Original task: ${originalTask}

Rubric criteria:
${criteriaText}

Output to evaluate:
${output}

Return JSON: {"score": number(0-100), "feedback": string(specific improvements needed), "criteriaScores": {"criterionName": score}}
Only return JSON.`;

    const raw = await this.provider.complete(prompt, { maxTokens: 400, temperature: 0.1 });
    try {
      const parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()) as { score: number; feedback: string; criteriaScores: Record<string, number> };
      return parsed;
    } catch {
      return { score: 50, feedback: 'Evaluation parse error — applying default score.', criteriaScores: {} };
    }
  }

  private async generateRefinement(
    currentOutput: string,
    originalTask: string,
    feedback: string,
    rubric: RefinementRubric,
  ): Promise<string> {
    const prompt = `You are an expert improving an AI-generated output.
Domain context: ${rubric.domainContext}
Original task: ${originalTask}

Current output (score below ${rubric.threshold}/100):
${currentOutput}

Specific improvement feedback:
${feedback}

Rewrite the output addressing ALL feedback points. Maintain the same format/structure.
Return ONLY the improved output — no preamble, no explanation.`;

    return this.provider.complete(prompt, { maxTokens: 2048, temperature: 0.2 });
  }
}
