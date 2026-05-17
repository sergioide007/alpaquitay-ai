/**
 * Infrastructure Adapter — IEnglishAIPort
 * Wraps the Alpaquitay AIProvider to generate English learning content.
 *
 * TOGAF Phase D: Technology Architecture
 * Hexagonal Architecture: Secondary Adapter (driven side)
 */

import type { AIProvider } from '../../../core/interfaces';
import type { IEnglishAIPort } from '../ports/output';
import type {
  CEFRLevel,
  Exercise,
  ExerciseResult,
  DailyPhrase,
  LearnerProgress,
  LevelAssessment,
  SkillArea,
} from '../domain/model';
import { CEFR_DESCRIPTORS } from '../domain/model';

export class AIProviderAdapter implements IEnglishAIPort {
  readonly portId = 'english-ai' as const;

  constructor(private readonly provider: AIProvider) {}

  async generateExercises(params: {
    level: CEFRLevel;
    skill: SkillArea;
    topic: string;
    count: number;
  }): Promise<Exercise[]> {
    const descriptor = CEFR_DESCRIPTORS[params.level];
    const prompt = `You are an expert English language teacher.
Generate ${params.count} ${params.skill} exercises for CEFR ${params.level} (${descriptor.label}) learners.
Topic: ${params.topic}

Return a JSON array. Each object must have:
- id: string (unique)
- type: one of "fill_blank"|"multiple_choice"|"rewrite_sentence"|"error_correction"
- skill: "${params.skill}"
- level: "${params.level}"
- prompt: string (the exercise question)
- options: string[] (for multiple_choice, 4 options; otherwise empty array)
- correctAnswer: string
- explanation: string (clear pedagogical explanation)
- ipaTranscription: string (IPA for key vocabulary, empty if not relevant)

Return ONLY the JSON array. No preamble, no markdown fences.`;

    const raw = await this.provider.complete(prompt, { maxTokens: 2000, temperature: 0.4 });
    return this.parseJSON<Exercise[]>(raw, []);
  }

  async generateDailyPhrases(params: {
    level: CEFRLevel;
    category: DailyPhrase['category'];
    count: number;
  }): Promise<DailyPhrase[]> {
    const descriptor = CEFR_DESCRIPTORS[params.level];
    const prompt = `You are an expert English language teacher.
Generate ${params.count} ${params.category} English phrases for CEFR ${params.level} (${descriptor.label}) learners.

Return a JSON array. Each object:
- id: string (unique)
- phrase: string (the English phrase)
- translation: string (Spanish translation)
- context: string (one sentence showing usage)
- audioExample: string (a full sentence using the phrase)
- ipaTranscription: string (IPA transcription of the phrase)
- level: "${params.level}"
- category: "${params.category}"

Return ONLY the JSON array. No preamble, no markdown fences.`;

    const raw = await this.provider.complete(prompt, { maxTokens: 1500, temperature: 0.5 });
    return this.parseJSON<DailyPhrase[]>(raw, []);
  }

  async evaluateAnswer(params: {
    exercise: Exercise;
    userAnswer: string;
  }): Promise<ExerciseResult> {
    const prompt = `You are a strict but encouraging English teacher.
Exercise: ${params.exercise.prompt}
Correct answer: ${params.exercise.correctAnswer}
Student answer: ${params.userAnswer}
Explanation context: ${params.exercise.explanation}

Evaluate the student answer. Return JSON:
{
  "isCorrect": boolean,
  "score": number (0-100),
  "feedback": string (encouraging, max 2 sentences, explain the rule)
}
Return ONLY the JSON object.`;

    const raw = await this.provider.complete(prompt, { maxTokens: 300, temperature: 0.2 });
    const parsed = this.parseJSON<{ isCorrect: boolean; score: number; feedback: string }>(raw, {
      isCorrect: false, score: 0, feedback: 'Could not evaluate. Please try again.'
    });

    return {
      exerciseId: params.exercise.id,
      userAnswer: params.userAnswer,
      isCorrect: parsed.isCorrect,
      score: parsed.score,
      feedback: parsed.feedback,
      completedAt: new Date(),
    };
  }

  async assessLevel(params: {
    sampleText?: string;
    exerciseResults?: ExerciseResult[];
  }): Promise<LevelAssessment> {
    const context = params.sampleText
      ? `Sample text written by the learner:\n"${params.sampleText}"`
      : `Exercise history: ${params.exerciseResults?.length ?? 0} attempts, ${params.exerciseResults?.filter(r => r.isCorrect).length ?? 0} correct`;

    const prompt = `You are a CEFR assessment expert.
${context}

Determine the learner's English level. Return JSON:
{
  "proposedLevel": "A1"|"A2"|"B1"|"B2"|"C1"|"C2",
  "confidence": number (0-100),
  "strengths": ["grammar"|"vocabulary"|"pronunciation"|"listening"|"speaking"|"writing"],
  "weaknesses": ["grammar"|"vocabulary"|"pronunciation"|"listening"|"speaking"|"writing"],
  "recommendedFocus": string (one key area to focus on, max 1 sentence),
  "nextMilestone": string (what achieving the next level would unlock, max 1 sentence)
}
Return ONLY the JSON object.`;

    const raw = await this.provider.complete(prompt, { maxTokens: 400, temperature: 0.3 });
    return this.parseJSON<LevelAssessment>(raw, {
      proposedLevel: 'B1',
      confidence: 50,
      strengths: [],
      weaknesses: ['grammar'],
      recommendedFocus: 'Focus on grammar accuracy.',
      nextMilestone: 'Achieve fluency in professional conversations.',
    });
  }

  async generateWeeklyInsight(progress: LearnerProgress): Promise<string> {
    const accuracy = progress.totalAttempted > 0
      ? Math.round((progress.totalCorrect / progress.totalAttempted) * 100)
      : 0;

    const prompt = `You are an encouraging English coach. Write a 2-sentence weekly insight for a learner:
- Level: ${progress.currentLevel}, Target: ${progress.targetLevel}
- Accuracy: ${accuracy}%, Lessons: ${progress.lessonsCompleted}, Streak: ${progress.streakDays} days
Focus on what they did well and one specific next step. Be warm and motivating.`;

    return this.provider.complete(prompt, { maxTokens: 150, temperature: 0.7 });
  }

  private parseJSON<T>(raw: string, fallback: T): T {
    try {
      const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(clean) as T;
    } catch {
      return fallback;
    }
  }
}
