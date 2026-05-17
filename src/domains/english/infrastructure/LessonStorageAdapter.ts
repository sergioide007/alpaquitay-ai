/**
 * Infrastructure Adapter — ILessonRepository
 * Persists lessons and learner progress to .alpaquitay/english/ on disk.
 *
 * TOGAF Phase D: Technology Architecture
 * Hexagonal Architecture: Secondary Adapter (driven side)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ILessonRepository } from '../ports/output';
import type { ExerciseResult, Lesson, LearnerProgress, DailyPhrase, SkillArea, CEFRLevel } from '../domain/model';

interface StorageSchema {
  lessons: Record<string, Lesson>;
  progress: Record<string, LearnerProgress>;
  exerciseHistory: ExerciseResult[];
  dailyPhrases: Record<string, DailyPhrase[]>;
}

export class LessonStorageAdapter implements ILessonRepository {
  readonly portId = 'lesson-repository' as const;

  private readonly storageDir: string;
  private readonly storageFile: string;
  private cache: StorageSchema = { lessons: {}, progress: {}, exerciseHistory: [], dailyPhrases: {} };
  private loaded = false;

  constructor(workspacePath: string) {
    this.storageDir = path.join(workspacePath, '.alpaquitay', 'english');
    this.storageFile = path.join(this.storageDir, 'data.json');
  }

  async saveLesson(lesson: Lesson): Promise<void> {
    await this.ensureLoaded();
    this.cache.lessons[lesson.id] = lesson;
    await this.persist();
  }

  async getLesson(lessonId: string): Promise<Lesson | null> {
    await this.ensureLoaded();
    return this.cache.lessons[lessonId] ?? null;
  }

  async getLessonsBySkill(skill: SkillArea, level: CEFRLevel): Promise<Lesson[]> {
    await this.ensureLoaded();
    return Object.values(this.cache.lessons).filter(l => l.skill === skill && l.level === level);
  }

  async saveProgress(progress: LearnerProgress): Promise<void> {
    await this.ensureLoaded();
    this.cache.progress[progress.learnerId] = progress;
    await this.persist();
  }

  async getProgress(learnerId: string): Promise<LearnerProgress | null> {
    await this.ensureLoaded();
    return this.cache.progress[learnerId] ?? null;
  }

  async saveExerciseResult(result: ExerciseResult): Promise<void> {
    await this.ensureLoaded();
    this.cache.exerciseHistory.push(result);
    if (this.cache.exerciseHistory.length > 500) {
      this.cache.exerciseHistory = this.cache.exerciseHistory.slice(-500);
    }
    await this.persist();
  }

  async getExerciseHistory(learnerId: string, limit = 50): Promise<ExerciseResult[]> {
    await this.ensureLoaded();
    return this.cache.exerciseHistory.slice(-limit);
  }

  async saveDailyPhrases(phrases: DailyPhrase[], date: string): Promise<void> {
    await this.ensureLoaded();
    this.cache.dailyPhrases[date] = phrases;
    await this.persist();
  }

  async getDailyPhrases(date: string): Promise<DailyPhrase[]> {
    await this.ensureLoaded();
    return this.cache.dailyPhrases[date] ?? [];
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf-8');
        this.cache = JSON.parse(raw) as StorageSchema;
      }
    } catch {
      this.cache = { lessons: {}, progress: {}, exerciseHistory: [], dailyPhrases: {} };
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.writeFileSync(this.storageFile, JSON.stringify(this.cache, null, 2), 'utf-8');
  }
}
