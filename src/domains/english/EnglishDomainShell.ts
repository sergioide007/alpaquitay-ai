/**
 * English Domain Agent Shell
 *
 * Autonomous agent that helps learners master the English language.
 * Receives a learning objective, decomposes it into sessions, executes
 * exercises end-to-end, and tracks CEFR-aligned progress.
 *
 * ─── Architectural Foundations ──────────────────────────────────────────────
 * Pattern:    Hexagonal Architecture (Ports & Adapters) — Alistair Cockburn
 * Framework:  TOGAF ADM Phases B–D (Business → Application → Technology)
 * Notation:   ArchiMate 3.2 (Application Service + Application Component)
 * Standard:   CEFR / ISO 17024 competency assessment
 *             ISO 21001:2018 Educational organizations
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 4+1 Architectural Views:
 *   Logical:     Domain model in ./domain/model.ts
 *   Development: Hexagonal layers domain/ports/application/infrastructure
 *   Process:     assess → plan → generate → practice → evaluate → persist
 *   Physical:    VS Code host + .alpaquitay/english/data.json + AI provider
 *   Scenarios:   "Learn past perfect", "Practice business phrases", "Assess my level"
 */

import type { AIProvider } from '../../core/interfaces';
import type { IDomainAgentShell, DomainId, DomainResult, GuardrailResult } from '../interfaces/DomainAgentShell';
import type { CEFRLevel } from './domain/model';
import { AIProviderAdapter }        from './infrastructure/AIProviderAdapter';
import { LessonStorageAdapter }     from './infrastructure/LessonStorageAdapter';
import { PracticeGrammarUseCase }   from './application/PracticeGrammarUseCase';
import { GetDailyPhrasesUseCase }   from './application/GetDailyPhrasesUseCase';
import { AssessLevelUseCase }       from './application/AssessLevelUseCase';
import { SubmitExerciseUseCase }    from './application/SubmitExerciseUseCase';

/** Named use cases exposed through IDomainAgentShell.run(). */
type EnglishUseCaseId =
  | 'practice-grammar'
  | 'practice-pronunciation'
  | 'get-daily-phrases'
  | 'assess-level'
  | 'submit-exercise'
  | 'get-progress';

export class EnglishDomainShell implements IDomainAgentShell {
  readonly domainId: DomainId = 'english';
  readonly version = '1.0.0';

  private aiAdapter!: AIProviderAdapter;
  private storage!: LessonStorageAdapter;
  private grammar!: PracticeGrammarUseCase;
  private phrases!: GetDailyPhrasesUseCase;
  private assess!: AssessLevelUseCase;
  private submit!: SubmitExerciseUseCase;
  private workspacePath!: string;

  async initialize(provider: AIProvider, workspacePath: string): Promise<void> {
    this.workspacePath = workspacePath;
    this.aiAdapter = new AIProviderAdapter(provider);
    this.storage   = new LessonStorageAdapter(workspacePath);
    this.grammar   = new PracticeGrammarUseCase(this.aiAdapter, this.storage);
    this.phrases   = new GetDailyPhrasesUseCase(this.aiAdapter, this.storage);
    this.assess    = new AssessLevelUseCase(this.aiAdapter, this.storage);
    this.submit    = new SubmitExerciseUseCase(this.aiAdapter, this.storage);
  }

  async run(useCaseId: string, params: Record<string, unknown>): Promise<DomainResult> {
    switch (useCaseId as EnglishUseCaseId) {
      case 'practice-grammar':
        return this.grammar.execute({
          learnerId:         String(params.learnerId ?? 'default'),
          level:             (params.level as CEFRLevel) ?? 'B1',
          topic:             String(params.topic ?? 'Past perfect'),
          numberOfExercises: Number(params.numberOfExercises ?? 5),
        });

      case 'get-daily-phrases':
        return this.phrases.execute({
          learnerId: String(params.learnerId ?? 'default'),
          level:     (params.level as CEFRLevel) ?? 'B1',
          category:  (params.category as 'formal'|'informal'|'business'|'travel'|'academic') ?? 'informal',
          count:     Number(params.count ?? 5),
        });

      case 'assess-level':
        return this.assess.execute({
          learnerId:  String(params.learnerId ?? 'default'),
          sampleText: params.sampleText ? String(params.sampleText) : undefined,
        });

      case 'submit-exercise':
        return this.submit.execute({
          learnerId:   String(params.learnerId ?? 'default'),
          exerciseId:  String(params.exerciseId),
          userAnswer:  String(params.userAnswer),
          lessonId:    String(params.lessonId),
        });

      case 'get-progress': {
        const progress = await this.storage.getProgress(String(params.learnerId ?? 'default'));
        const insight = progress ? await this.aiAdapter.generateWeeklyInsight(progress) : 'Start your first lesson!';
        return { success: true, data: { progress, weeklyInsight: insight } };
      }

      default:
        return { success: false, errors: [`Unknown use case: ${useCaseId}`] };
    }
  }

  async checkGuardrails(output: unknown): Promise<GuardrailResult[]> {
    const results: GuardrailResult[] = [];

    if (output && typeof output === 'object') {
      const lesson = (output as Record<string, unknown>).lesson;
      if (lesson && typeof lesson === 'object') {
        const exercises = (lesson as Record<string, unknown>).exercises;
        if (!Array.isArray(exercises) || exercises.length === 0) {
          results.push({
            severity: 'warn',
            rule:     'ENGLISH-001',
            message:  'Lesson generated with no exercises — learner will have nothing to practice.',
          });
        }
      }
    }

    return results;
  }

  async saveMemory(): Promise<void> {
    // LessonStorageAdapter persists synchronously on every write.
    // No additional flush needed.
  }

  async loadMemory(): Promise<void> {
    // Storage loads lazily on first access via ensureLoaded().
  }
}
