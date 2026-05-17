import { BaseIntegration } from '../BaseIntegration';
import { IKnowledgeIntegration, IntegrationMetadata, KnowledgeResult } from '../interfaces';

/**
 * Notion knowledge base integration — REST API, no @notionhq/client dependency.
 *
 * Uses the Notion public API v1 to:
 *   - Search pages by query text
 *   - Read block children for page content
 *   - Cache results in memory to respect rate limits (3 req/s per integration token)
 */
export class NotionKnowledge extends BaseIntegration implements IKnowledgeIntegration {
  readonly metadata: IntegrationMetadata = {
    id: 'notion',
    name: 'Notion Knowledge Base',
    category: 'knowledge',
    description: 'Pulls project context, specs, and documentation from Notion pages',
    requiredSecrets: ['apiKey'],
  };

  private apiKey = '';
  private rootPageId = '';
  private readonly baseUrl = 'https://api.notion.com/v1';
  private readonly apiVersion = '2022-06-28';

  // In-memory LRU-style cache: pageId → { content, fetchedAt }
  private readonly cache = new Map<string, { content: string; fetchedAt: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(rootPageId?: string) {
    super();
    if (rootPageId) { this.rootPageId = rootPageId; }
  }

  protected async onInitialize(): Promise<void> {
    this.apiKey = (await this.vault.get('apiKey')) ?? '';
    const storedRoot = await this.vault.get('rootPageId');
    if (storedRoot) { this.rootPageId = storedRoot; }
  }

  protected override async checkAvailability(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/users/me`, {
        headers: this.authHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── IKnowledgeIntegration ─────────────────────────────────────────────────

  async query(query: string, maxResults = 10): Promise<KnowledgeResult[]> {
    const results = await this.searchPages(query, maxResults);
    const enriched = await Promise.all(
      results.map(async (page) => {
        const content = await this.getPageContent(page.id);
        return { ...page, content };
      })
    );
    return enriched
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, maxResults);
  }

  async sync(): Promise<void> {
    this.cache.clear();
  }

  // ── Private: Notion API calls ─────────────────────────────────────────────

  private async searchPages(query: string, limit: number): Promise<KnowledgeResult[]> {
    const body: Record<string, unknown> = {
      query,
      page_size: Math.min(limit, 100),
      filter: { value: 'page', property: 'object' },
    };

    if (this.rootPageId) {
      body['filter'] = { and: [body['filter'], { property: 'ancestor', value: this.rootPageId }] };
    }

    const res = await this.post('/search', body);
    if (!res.ok) { return []; }

    const data = await res.json() as { results?: NotionPage[] };
    return (data.results ?? []).map((page, idx) => ({
      id: page.id,
      title: this.extractTitle(page),
      content: '',
      url: page.url,
      score: 1 - idx / (data.results?.length ?? 1),
    }));
  }

  private async getPageContent(pageId: string): Promise<string> {
    const cached = this.cache.get(pageId);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.content;
    }

    const content = await this.fetchBlockContent(pageId);
    this.cache.set(pageId, { content, fetchedAt: Date.now() });
    return content;
  }

  private async fetchBlockContent(blockId: string, depth = 0): Promise<string> {
    if (depth > 3) { return ''; } // max recursion for nested pages

    const res = await this.get(`/blocks/${blockId}/children`);
    if (!res.ok) { return ''; }

    const data = await res.json() as { results?: NotionBlock[] };
    const parts: string[] = [];

    for (const block of (data.results ?? [])) {
      const text = this.extractBlockText(block);
      if (text) { parts.push(text); }
      if (block.has_children && depth < 3) {
        const nested = await this.fetchBlockContent(block.id, depth + 1);
        if (nested) { parts.push(nested); }
      }
    }

    return parts.join('\n');
  }

  private extractTitle(page: NotionPage): string {
    const props = page.properties;
    if (!props) { return page.id; }
    const titleProp = props['title'] ?? props['Name'] ?? Object.values(props)[0];
    const richText = titleProp?.title ?? titleProp?.rich_text ?? [];
    return richText.map((t: { plain_text?: string }) => t.plain_text ?? '').join('') || page.id;
  }

  private extractBlockText(block: NotionBlock): string {
    const richTextTypes = ['paragraph', 'heading_1', 'heading_2', 'heading_3',
      'bulleted_list_item', 'numbered_list_item', 'quote', 'callout', 'code'];

    if (richTextTypes.includes(block.type)) {
      const typeData = (block as unknown as Record<string, unknown>)[block.type] as { rich_text?: { plain_text?: string }[] };
      return (typeData?.rich_text ?? []).map(t => t.plain_text ?? '').join('');
    }
    return '';
  }

  private get(path: string): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, { headers: this.authHeaders() });
  }

  private post(path: string, body: Record<string, unknown>): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private authHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Notion-Version': this.apiVersion,
    };
  }
}

// ── Notion API type shims ─────────────────────────────────────────────────────

interface NotionPage {
  id: string;
  url: string;
  properties?: Record<string, { title?: { plain_text?: string }[]; rich_text?: { plain_text?: string }[] }>;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
}
