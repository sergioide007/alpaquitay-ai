/**
 * English Domain — Primary Ports (Driving / Input side of the Hexagon).
 *
 * These interfaces are what the Domain Agent Shell exposes to callers
 * (VS Code commands, webview panels, skill pipeline).
 *
 * ArchiMate: Application Interface (provided)
 * TOGAF Phase C: Application Architecture — inbound service contracts
 */

import type { DomainInputPort } from '../../interfaces/DomainAgentShell';
import type {
  CEFRLevel,
  ExerciseResult,
  LearnerProgress,
  LevelAssessment,
  Lesson,
  DailyPhrase,
  SkillArea,
} from '../domain/model';

// ── PracticeGrammar ──────────────────────────────────────────────────────────

export interface PracticeGrammarRequest {
  learnerId: string;
  level: CEFRLevel;
  topic: string;
  numberOfExercises?: number;
}

export interface PracticeGrammarResponse {
  lesson: Lesson;
  estimatedMinutes: number;
}

export type IPracticeGrammarPort = DomainInputPort<PracticeGrammarRequest, PracticeGrammarResponse>;

// ── PracticePronunciation ────────────────────────────────────────────────────

export interface PracticePronunciationRequest {
  learnerId: string;
  level: CEFRLevel;
  focusSound?: string;
  numberOfDrills?: number;
}

export interface PracticePronunciationResponse {
  lesson: Lesson;
  ipaGuide: string;
  audioInstructions: string[];
}

export type IPracticePronunciationPort = DomainInputPort<PracticePronunciationRequest, PracticePronunciationResponse>;

// ── GetDailyPhrases ──────────────────────────────────────────────────────────

export interface GetDailyPhrasesRequest {
  learnerId: string;
  level: CEFRLevel;
  category?: DailyPhrase['category'];
  count?: number;
}

export interface GetDailyPhrasesResponse {
  phrases: DailyPhrase[];
  theme: string;
  practiceScript: string;
}

export type IGetDailyPhrasesPort = DomainInputPort<GetDailyPhrasesRequest, GetDailyPhrasesResponse>;

// ── AssessLevel ──────────────────────────────────────────────────────────────

export interface AssessLevelRequest {
  learnerId: string;
  sampleText?: string;
  answers?: ExerciseResult[];
}

export interface AssessLevelResponse {
  assessment: LevelAssessment;
  generatedLessons: Lesson[];
}

export type IAssessLevelPort = DomainInputPort<AssessLevelRequest, AssessLevelResponse>;

// ── SubmitExercise ───────────────────────────────────────────────────────────

export interface SubmitExerciseRequest {
  learnerId: string;
  exerciseId: string;
  userAnswer: string;
  lessonId: string;
}

export interface SubmitExerciseResponse {
  result: ExerciseResult;
  nextExerciseId?: string;
  lessonComplete: boolean;
}

export type ISubmitExercisePort = DomainInputPort<SubmitExerciseRequest, SubmitExerciseResponse>;

// ── GetProgress ──────────────────────────────────────────────────────────────

export interface GetProgressRequest {
  learnerId: string;
  skill?: SkillArea;
}

export interface GetProgressResponse {
  progress: LearnerProgress;
  weeklyInsight: string;
  recommendedNextLesson: string;
}

export type IGetProgressPort = DomainInputPort<GetProgressRequest, GetProgressResponse>;
