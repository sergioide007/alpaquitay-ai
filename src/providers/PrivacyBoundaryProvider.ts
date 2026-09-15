import { AIProvider, AIResponse, ChatOptions, Message, ProviderType } from '../core/interfaces';
import {
  PIICategory,
  PrivacyGuard,
  PrivacyReport,
} from '../domains/orchestration/privacy/PrivacyGuard';

const LOCAL_PROVIDER_TYPES = new Set<ProviderType>(['ollama', 'lmstudio']);

export type SecretCategory =
  | 'credential'
  | 'bearer-token'
  | 'private-key'
  | 'provider-api-key'
  | 'aws-access-key'
  | 'jwt';

export type PrivacyRedactionCategory = PIICategory | SecretCategory;

export interface PrivacyRedaction {
  readonly category: PrivacyRedactionCategory;
  readonly placeholder: string;
}

/** Metadata about one request field. Detected values are deliberately omitted. */
export interface PrivacyDisclosureField {
  readonly path: string;
  readonly riskLevel: PrivacyReport['riskLevel'];
  readonly redactions: readonly PrivacyRedaction[];
  readonly gdprArticlesTriggered: readonly string[];
}

/**
 * An inspectable, value-free record of what the privacy boundary disclosed.
 * It is recorded before the provider call, so failed cloud calls are auditable too.
 */
export interface PrivacyDisclosure {
  readonly providerType: ProviderType;
  readonly operation: 'chat' | 'complete';
  readonly destination: 'cloud';
  readonly sanitized: boolean;
  readonly redactionCount: number;
  readonly fields: readonly PrivacyDisclosureField[];
}

export type ProviderDestination = 'local' | 'cloud';

interface SecretPattern {
  readonly category: SecretCategory;
  readonly pattern: RegExp;
  readonly replacement: (match: string, placeholder: string, groups: string[]) => string;
  readonly shouldReplace?: (
    match: string,
    groups: string[],
    offset: number,
    input: string
  ) => boolean;
}

interface SecretSanitizeResult {
  readonly sanitizedText: string;
  readonly redactions: PrivacyRedaction[];
}

interface SanitizedField {
  readonly text: string;
  readonly disclosure: PrivacyDisclosureField;
}

const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    category: 'private-key',
    pattern: /-----BEGIN ([A-Z ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g,
    replacement: (_match, placeholder) => placeholder,
  },
  {
    category: 'bearer-token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
    replacement: (_match, placeholder) => placeholder,
  },
  {
    category: 'credential',
    pattern: /\bBasic\s+[A-Za-z0-9+/]{8,}={0,2}/gi,
    replacement: (_match, placeholder) => placeholder,
  },
  {
    category: 'provider-api-key',
    pattern: /\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
    replacement: (_match, placeholder) => placeholder,
  },
  {
    category: 'aws-access-key',
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: (_match, placeholder) => placeholder,
  },
  {
    category: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: (_match, placeholder) => placeholder,
  },
  {
    category: 'credential',
    pattern: /((?:^|[^\w])(?:my\s+)?["']?(?:(?:[A-Za-z][A-Za-z0-9]*[_-])*(?:password|passwd|pwd|secret|token|private[\s_-]?key)|(?:[A-Za-z][A-Za-z0-9]*[_-])*(?:api|access|auth|client)[\s_-]?(?:key|token|secret))["']?\s*(?::|=|\bis\b)\s*)(["'])(?!\[SECRET_)((?:\\.|(?!\2)[^\\\r\n])*)\2/gim,
    replacement: (_match, placeholder, groups) => `${groups[0]}${groups[1]}${placeholder}${groups[1]}`,
  },
  {
    category: 'credential',
    pattern: /((?:^|[^\w])(?:my\s+)?["']?(?:(?:[A-Za-z][A-Za-z0-9]*[_-])*(?:password|passwd|pwd|secret|token|private[\s_-]?key)|(?:[A-Za-z][A-Za-z0-9]*[_-])*(?:api|access|auth|client)[\s_-]?(?:key|token|secret))["']?\s*(?::|=|\bis\b)\s*)(?!["'[])([^\s,;}\]]+)/gim,
    replacement: (_match, placeholder, groups) => `${groups[0]}${placeholder}`,
    shouldReplace: (_match, groups, offset, input) => {
      const value = groups[1];
      if (/^(?:process\.env|import\.meta\.env|Deno\.env|os\.environ|getenv\()/i.test(value)) {
        return false;
      }
      const precedingText = input.slice(Math.max(0, offset - 16), offset);
      const memberExpression = /^(?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*$/.test(value);
      return !(memberExpression && /\b(?:const|let|var)\s*$/i.test(precedingText));
    },
  },
  {
    category: 'credential',
    pattern: /(\bhttps?:\/\/[^:\s/@]+:)([^@\s/]+)(@)/gi,
    replacement: (_match, placeholder, groups) => `${groups[0]}${placeholder}${groups[2]}`,
  },
];

function sanitizeSecrets(text: string): SecretSanitizeResult {
  let sanitizedText = text;
  const redactions: PrivacyRedaction[] = [];

  for (const secretPattern of SECRET_PATTERNS) {
    secretPattern.pattern.lastIndex = 0;
    sanitizedText = sanitizedText.replace(secretPattern.pattern, (match: string, ...args: unknown[]) => {
      const groups = args.slice(0, -2).map(String);
      const offset = Number(args[args.length - 2]);
      const input = String(args[args.length - 1]);
      if (secretPattern.shouldReplace && !secretPattern.shouldReplace(match, groups, offset, input)) {
        return match;
      }
      const placeholder = `[SECRET_${redactions.length}]`;
      redactions.push({ category: secretPattern.category, placeholder });
      return secretPattern.replacement(match, placeholder, groups);
    });
  }

  return { sanitizedText, redactions };
}

function cloneDisclosure(disclosure: PrivacyDisclosure): PrivacyDisclosure {
  return {
    ...disclosure,
    fields: disclosure.fields.map(field => ({
      ...field,
      redactions: field.redactions.map(redaction => ({ ...redaction })),
      gdprArticlesTriggered: [...field.gdprArticlesTriggered],
    })),
  };
}

/** Default locality for provider types when no endpoint information is available. */
export function isLocalAIProvider(provider: AIProvider): boolean {
  return LOCAL_PROVIDER_TYPES.has(provider.type);
}

/** Only loopback endpoints qualify for the on-device privacy exemption. */
export function isLoopbackAIEndpoint(endpoint: string): boolean {
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return hostname === 'localhost'
      || hostname === '0.0.0.0'
      || hostname === '[::1]'
      || hostname === '::1'
      || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  } catch {
    return false;
  }
}

/**
 * AIProvider decorator that enforces data minimization immediately before a
 * cloud provider receives a prompt. Local providers are never decorated by
 * {@link withPrivacyBoundary}.
 */
export class PrivacyBoundaryProvider implements AIProvider {
  private readonly privacyGuard = new PrivacyGuard();
  private lastDisclosure: PrivacyDisclosure | null = null;

  constructor(private readonly provider: AIProvider) { }

  get name(): string { return this.provider.name; }
  get type(): ProviderType { return this.provider.type; }
  get modelName(): string { return this.provider.modelName; }

  isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<AIResponse> {
    const fields: SanitizedField[] = messages.map((message, index) =>
      this.sanitizeField(`messages[${index}].content`, message.content)
    );
    const sanitizedMessages = messages.map((message, index) => ({
      ...message,
      content: fields[index].text,
    }));

    let sanitizedOptions = options;
    if (options?.systemPrompt !== undefined) {
      const systemPrompt = this.sanitizeField('options.systemPrompt', options.systemPrompt);
      fields.push(systemPrompt);
      sanitizedOptions = { ...options, systemPrompt: systemPrompt.text };
    }

    this.recordDisclosure('chat', fields.map(field => field.disclosure));
    return this.provider.chat(sanitizedMessages, sanitizedOptions);
  }

  async complete(prompt: string, options?: ChatOptions): Promise<string> {
    return this.completeThrough(
      prompt,
      options,
      (sanitizedPrompt, sanitizedOptions) => this.provider.complete(sanitizedPrompt, sanitizedOptions)
    );
  }

  /** Protect a completion routed through another cloud-capable LLM integration. */
  async completeThrough<T>(
    prompt: string,
    options: ChatOptions | undefined,
    send: (sanitizedPrompt: string, sanitizedOptions?: ChatOptions) => Promise<T>
  ): Promise<T> {
    const promptField = this.sanitizeField('prompt', prompt);
    const fields = [promptField];

    let sanitizedOptions = options;
    if (options?.systemPrompt !== undefined) {
      const systemPrompt = this.sanitizeField('options.systemPrompt', options.systemPrompt);
      fields.push(systemPrompt);
      sanitizedOptions = { ...options, systemPrompt: systemPrompt.text };
    }

    const disclosureFields = fields.map(field => field.disclosure);
    this.recordDisclosure('complete', disclosureFields);
    try {
      return await send(promptField.text, sanitizedOptions);
    } finally {
      // A hybrid integration may call this same decorator again. Restore the
      // outer disclosure so callers inspect the request they originally made.
      this.recordDisclosure('complete', disclosureFields);
    }
  }

  getLastDisclosure(): PrivacyDisclosure | null {
    return this.lastDisclosure ? cloneDisclosure(this.lastDisclosure) : null;
  }

  private sanitizeField(path: string, text: string): SanitizedField {
    // Secrets go first so PII heuristics cannot partially transform a token.
    const secretResult = sanitizeSecrets(text);
    const privacyReport = this.privacyGuard.sanitize(secretResult.sanitizedText);
    const piiRedactions: PrivacyRedaction[] = privacyReport.detections.map(detection => ({
      category: detection.category,
      placeholder: detection.placeholder,
    }));
    const redactions = [...secretResult.redactions, ...piiRedactions];
    const gdprArticles = new Set(privacyReport.gdprArticlesTriggered);
    if (secretResult.redactions.length > 0) {
      gdprArticles.add('Art. 32 — security measures');
    }

    return {
      text: privacyReport.sanitizedText,
      disclosure: {
        path,
        riskLevel: secretResult.redactions.length > 0 ? 'high' : privacyReport.riskLevel,
        redactions,
        gdprArticlesTriggered: [...gdprArticles],
      },
    };
  }

  private recordDisclosure(
    operation: PrivacyDisclosure['operation'],
    fields: PrivacyDisclosureField[]
  ): void {
    this.lastDisclosure = {
      providerType: this.type,
      operation,
      destination: 'cloud',
      sanitized: fields.some(field => field.redactions.length > 0),
      redactionCount: fields.reduce((sum, field) => sum + field.redactions.length, 0),
      fields,
    };
  }
}

/** Add the boundary exactly once; local providers pass through unchanged. */
export function withPrivacyBoundary(
  provider: AIProvider,
  destination: ProviderDestination = isLocalAIProvider(provider) ? 'local' : 'cloud'
): AIProvider {
  if (destination === 'local' || provider instanceof PrivacyBoundaryProvider) {
    return provider;
  }
  return new PrivacyBoundaryProvider(provider);
}
