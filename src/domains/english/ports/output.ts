/**
 * English Domain — Secondary Ports (Driven / Output side of the Hexagon).
 *
 * Infrastructure adapters implement these interfaces. The domain never
 * imports from infrastructure — only from this file.
 *
 * ArchiMate: Application Interface (required)
 * TOGAF Phase C: Application Architecture — outbound service contracts
 */

import type { DomainOutputPort } from '../../interfaces/DomainAgentShell';
import type {
  CEFRLevel,
  Exercise,
  ExerciseResult,
  Lesson,
  LearnerProgress,
  LevelAssessment,
  DailyPhrase,
  SkillArea,
} from '../domain/model';

/** AI generation port — wraps any Alpaquitay AIProvider for domain use. */
export interface IEnglishAIPort extends DomainOutputPort {
  readonly portId: 'english-ai';

  generateExercises(params: {
    level: CEFRLevel;
    skill: SkillArea;
    topic: string;
    count: number;
  }): Promise<Exercise[]>;

  generateDailyPhrases(params: {
    level: CEFRLevel;
    category: DailyPhrase['category'];
    count: number;
  }): Promise<DailyPhrase[]>;

  evaluateAnswer(params: {
    exercise: Exercise;
    userAnswer: string;
  }): Promise<ExerciseResult>;

  assessLevel(params: {
    sampleText?: string;
    exerciseResults?: ExerciseResult[];
  }): Promise<LevelAssessment>;

  generateWeeklyInsight(progress: LearnerProgress): Promise<string>;
}

/** Lesson persistence port — stores and retrieves lessons and progress. */
export interface ILessonRepository extends DomainOutputPort {
  readonly portId: 'lesson-repository';

  saveLesson(lesson: Lesson): Promise<void>;
  getLesson(lessonId: string): Promise<Lesson | null>;
  getLessonsBySkill(skill: SkillArea, level: CEFRLevel): Promise<Lesson[]>;

  saveProgress(progress: LearnerProgress): Promise<void>;
  getProgress(learnerId: string): Promise<LearnerProgress | null>;

  saveExerciseResult(result: ExerciseResult): Promise<void>;
  getExerciseHistory(learnerId: string, limit?: number): Promise<ExerciseResult[]>;

  saveDailyPhrases(phrases: DailyPhrase[], date: string): Promise<void>;
  getDailyPhrases(date: string): Promise<DailyPhrase[]>;
}

/** Speech port — pronunciation feedback (browser SpeechSynthesis API via webview). */
export interface ISpeechPort extends DomainOutputPort {
  readonly portId: 'speech';

  /** Synthesize text to IPA phonetic notation. */
  textToIPA(text: string): Promise<string>;

  /** Score a pronunciation attempt (0–100). */
  scorePronunciation(params: {
    targetText: string;
    spokenText: string;
  }): Promise<{ score: number; feedback: string; troubleSpots: string[] }>;

  /** Generate audio instructions as a Base64 data URI (WebSpeech or TTS API). */
  generateAudioHint(text: string, rate?: number): Promise<string>;
}
