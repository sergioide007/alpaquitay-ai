/**
 * English Domain — Pure domain model. Zero framework imports.
 *
 * Standard alignment:
 *   CEFR (Common European Framework of Reference for Languages)
 *   Council of Europe — aligned with ISO 17024 competency assessment
 *   ISO 21001:2018 Educational organizations management systems
 */

/** CEFR proficiency levels A1→C2 (ISO 17024 aligned). */
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type SkillArea = 'grammar' | 'vocabulary' | 'pronunciation' | 'listening' | 'speaking' | 'writing';

export type ExerciseType =
  | 'fill_blank'
  | 'multiple_choice'
  | 'rewrite_sentence'
  | 'pronunciation_drill'
  | 'phrase_translation'
  | 'error_correction'
  | 'listening_comprehension'
  | 'free_writing';

export interface CEFRDescriptor {
  level: CEFRLevel;
  label: string;
  description: string;
  typicalVocabularySize: number;
}

export const CEFR_DESCRIPTORS: Record<CEFRLevel, CEFRDescriptor> = {
  A1: { level: 'A1', label: 'Beginner',          description: 'Understands and uses familiar everyday expressions.',       typicalVocabularySize: 500 },
  A2: { level: 'A2', label: 'Elementary',         description: 'Communicates in simple and routine tasks.',                 typicalVocabularySize: 1500 },
  B1: { level: 'B1', label: 'Intermediate',       description: 'Deals with most situations likely to arise whilst travelling.', typicalVocabularySize: 3500 },
  B2: { level: 'B2', label: 'Upper-Intermediate', description: 'Interacts with a degree of fluency with native speakers.',  typicalVocabularySize: 7000 },
  C1: { level: 'C1', label: 'Advanced',           description: 'Expresses ideas fluently and spontaneously.',              typicalVocabularySize: 12000 },
  C2: { level: 'C2', label: 'Proficient',         description: 'Understands with ease virtually everything heard or read.', typicalVocabularySize: 20000 },
};

export interface Exercise {
  id: string;
  type: ExerciseType;
  skill: SkillArea;
  level: CEFRLevel;
  prompt: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  audioHint?: string;
  ipaTranscription?: string;
}

export interface ExerciseResult {
  exerciseId: string;
  userAnswer: string;
  isCorrect: boolean;
  score: number;
  feedback: string;
  completedAt: Date;
}

export interface Lesson {
  id: string;
  title: string;
  skill: SkillArea;
  level: CEFRLevel;
  focus: string;
  exercises: Exercise[];
  phrases: DailyPhrase[];
  createdAt: Date;
}

export interface DailyPhrase {
  id: string;
  phrase: string;
  translation: string;
  context: string;
  audioExample: string;
  ipaTranscription: string;
  level: CEFRLevel;
  category: 'formal' | 'informal' | 'business' | 'travel' | 'academic';
}

export interface LearnerProgress {
  learnerId: string;
  currentLevel: CEFRLevel;
  targetLevel: CEFRLevel;
  skillScores: Record<SkillArea, number>;
  lessonsCompleted: number;
  exercisesCompleted: number;
  totalCorrect: number;
  totalAttempted: number;
  streakDays: number;
  lastSessionAt?: Date;
  levelHistory: Array<{ level: CEFRLevel; achievedAt: Date }>;
}

export interface LevelAssessment {
  proposedLevel: CEFRLevel;
  confidence: number;
  strengths: SkillArea[];
  weaknesses: SkillArea[];
  recommendedFocus: string;
  nextMilestone: string;
}
