/**
 * Use Case: Get Daily Phrases
 * Delivers a curated set of CEFR-level phrases with IPA and practice script.
 */

import type { DomainResult } from '../../interfaces/DomainAgentShell';
import type { IEnglishAIPort, ILessonRepository } from '../ports/output';
import type {
  GetDailyPhrasesRequest,
  GetDailyPhrasesResponse,
  IGetDailyPhrasesPort,
} from '../ports/input';

export class GetDailyPhrasesUseCase implements IGetDailyPhrasesPort {
  constructor(
    private readonly ai: IEnglishAIPort,
    private readonly repo: ILessonRepository,
  ) {}

  async execute(req: GetDailyPhrasesRequest): Promise<DomainResult<GetDailyPhrasesResponse>> {
    const today = new Date().toISOString().split('T')[0];
    const cached = await this.repo.getDailyPhrases(today);
    const category = req.category ?? 'informal';
    const count = req.count ?? 5;

    const phrases = cached.length >= count
      ? cached.slice(0, count)
      : await this.ai.generateDailyPhrases({ level: req.level, category, count });

    if (cached.length < count) {
      await this.repo.saveDailyPhrases(phrases, today);
    }

    const practiceScript = phrases
      .map((p, i) => `${i + 1}. Say: "${p.phrase}"\n   /${p.ipaTranscription}/\n   ${p.context}`)
      .join('\n\n');

    return {
      success: true,
      data: {
        phrases,
        theme: `${category.charAt(0).toUpperCase() + category.slice(1)} English — ${req.level}`,
        practiceScript,
      },
    };
  }
}
