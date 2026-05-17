/**
 * Use Case: Assess Level
 * Evaluates learner text or exercise history to determine CEFR placement.
 * Generates a starter lesson plan for the detected level.
 */

import { randomUUID } from 'crypto';
import type { DomainResult } from '../../interfaces/DomainAgentShell';
import type { IEnglishAIPort, ILessonRepository } from '../ports/output';
import type {
  AssessLevelRequest,
  AssessLevelResponse,
  IAssessLevelPort,
} from '../ports/input';
import type { Lesson } from '../domain/model';

const STARTER_TOPICS: Record<string, string> = {
  grammar:       'Present simple vs present continuous',
  vocabulary:    'High-frequency word families',
  pronunciation: 'Vowel sounds and word stress',
};

export class AssessLevelUseCase implements IAssessLevelPort {
  constructor(
    private readonly ai: IEnglishAIPort,
    private readonly repo: ILessonRepository,
  ) {}

  async execute(req: AssessLevelRequest): Promise<DomainResult<AssessLevelResponse>> {
    const assessment = await this.ai.assessLevel({
      sampleText: req.sampleText,
      exerciseResults: req.answers,
    });

    const generatedLessons: Lesson[] = await Promise.all(
      (['grammar', 'vocabulary', 'pronunciation'] as const).map(async skill => {
        const exercises = await this.ai.generateExercises({
          level: assessment.proposedLevel,
          skill,
          topic: STARTER_TOPICS[skill],
          count: 3,
        });
        const lesson: Lesson = {
          id: randomUUID(),
          title: `${skill.charAt(0).toUpperCase() + skill.slice(1)}: ${STARTER_TOPICS[skill]}`,
          skill,
          level: assessment.proposedLevel,
          focus: STARTER_TOPICS[skill],
          exercises,
          phrases: [],
          createdAt: new Date(),
        };
        await this.repo.saveLesson(lesson);
        return lesson;
      }),
    );

    const progress = await this.repo.getProgress(req.learnerId);
    if (progress) {
      progress.currentLevel = assessment.proposedLevel;
      progress.levelHistory.push({ level: assessment.proposedLevel, achievedAt: new Date() });
      await this.repo.saveProgress(progress);
    }

    return {
      success: true,
      data: { assessment, generatedLessons },
    };
  }
}
