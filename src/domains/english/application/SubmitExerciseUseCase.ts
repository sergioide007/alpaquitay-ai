/**
 * Use Case: Submit Exercise Answer
 * Evaluates a learner answer, persists result, updates progress.
 */

import type { DomainResult } from '../../interfaces/DomainAgentShell';
import type { IEnglishAIPort, ILessonRepository } from '../ports/output';
import type {
  SubmitExerciseRequest,
  SubmitExerciseResponse,
  ISubmitExercisePort,
} from '../ports/input';
import type { LearnerProgress } from '../domain/model';

const LEVEL_ORDER: Array<import('../domain/model').CEFRLevel> = ['A1','A2','B1','B2','C1','C2'];

export class SubmitExerciseUseCase implements ISubmitExercisePort {
  constructor(
    private readonly ai: IEnglishAIPort,
    private readonly repo: ILessonRepository,
  ) {}

  async execute(req: SubmitExerciseRequest): Promise<DomainResult<SubmitExerciseResponse>> {
    const lesson = await this.repo.getLesson(req.lessonId);
    if (!lesson) {
      return { success: false, errors: [`Lesson ${req.lessonId} not found`] };
    }

    const exercise = lesson.exercises.find(e => e.id === req.exerciseId);
    if (!exercise) {
      return { success: false, errors: [`Exercise ${req.exerciseId} not found in lesson`] };
    }

    const result = await this.ai.evaluateAnswer({ exercise, userAnswer: req.userAnswer });
    await this.repo.saveExerciseResult(result);

    const progress = await this.repo.getProgress(req.learnerId) ?? this.defaultProgress(req.learnerId, lesson.level);
    progress.exercisesCompleted += 1;
    progress.totalAttempted += 1;
    if (result.isCorrect) {
      progress.totalCorrect += 1;
      progress.skillScores[exercise.skill] = Math.min(100, (progress.skillScores[exercise.skill] ?? 0) + 2);
    }
    progress.lastSessionAt = new Date();
    await this.repo.saveProgress(progress);

    const currentIdx = lesson.exercises.findIndex(e => e.id === req.exerciseId);
    const nextExercise = lesson.exercises[currentIdx + 1];
    const lessonComplete = !nextExercise;

    if (lessonComplete) {
      progress.lessonsCompleted += 1;
      await this.repo.saveProgress(progress);
    }

    return {
      success: true,
      data: {
        result,
        nextExerciseId: nextExercise?.id,
        lessonComplete,
      },
    };
  }

  private defaultProgress(learnerId: string, level: import('../domain/model').CEFRLevel): LearnerProgress {
    const nextIdx = Math.min(LEVEL_ORDER.indexOf(level) + 1, LEVEL_ORDER.length - 1);
    return {
      learnerId,
      currentLevel: level,
      targetLevel: LEVEL_ORDER[nextIdx],
      skillScores: { grammar: 0, vocabulary: 0, pronunciation: 0, listening: 0, speaking: 0, writing: 0 },
      lessonsCompleted: 0,
      exercisesCompleted: 0,
      totalCorrect: 0,
      totalAttempted: 0,
      streakDays: 0,
      levelHistory: [{ level, achievedAt: new Date() }],
    };
  }
}
