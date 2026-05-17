/**
 * Use Case: Practice Grammar
 * TOGAF Phase C (Application Architecture) — Application Service
 * 4+1 View: Process View — "Learner requests a grammar drill session"
 */

import { randomUUID } from 'crypto';
import type { DomainResult } from '../../interfaces/DomainAgentShell';
import type { IEnglishAIPort, ILessonRepository } from '../ports/output';
import type {
  PracticeGrammarRequest,
  PracticeGrammarResponse,
  IPracticeGrammarPort,
} from '../ports/input';
import type { Lesson } from '../domain/model';

export class PracticeGrammarUseCase implements IPracticeGrammarPort {
  constructor(
    private readonly ai: IEnglishAIPort,
    private readonly repo: ILessonRepository,
  ) {}

  async execute(req: PracticeGrammarRequest): Promise<DomainResult<PracticeGrammarResponse>> {
    const count = req.numberOfExercises ?? 5;

    const exercises = await this.ai.generateExercises({
      level: req.level,
      skill: 'grammar',
      topic: req.topic,
      count,
    });

    const lesson: Lesson = {
      id: randomUUID(),
      title: `Grammar: ${req.topic} (${req.level})`,
      skill: 'grammar',
      level: req.level,
      focus: req.topic,
      exercises,
      phrases: [],
      createdAt: new Date(),
    };

    await this.repo.saveLesson(lesson);

    return {
      success: true,
      data: {
        lesson,
        estimatedMinutes: Math.ceil(count * 2.5),
      },
    };
  }
}
