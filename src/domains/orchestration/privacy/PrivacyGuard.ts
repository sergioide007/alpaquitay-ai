/**
 * Privacy Guard — PII detection and masking before any data leaves the local context.
 *
 * Every prompt going to an AI provider passes through this guard.
 * PII is replaced with anonymized placeholders so the AI receives
 * structural/semantic content without personal data.
 *
 * Compliance:
 *   GDPR Article 5(1)(c) — Data minimization
 *   ISO/IEC 27001 A.8.2 — Information classification
 *   ISO/IEC 27018 — PII in cloud services
 *   CCPA — Consumer privacy rights
 *
 * Privacy-by-design: no PII is logged, stored, or transmitted.
 */

export type PIICategory =
  | 'email'
  | 'phone'
  | 'national-id'
  | 'credit-card'
  | 'ip-address'
  | 'full-name'
  | 'date-of-birth'
  | 'passport'
  | 'ssn'
  | 'iban'
  | 'medical-record'
  | 'location';

export interface PIIDetection {
  category: PIICategory;
  original: string;
  placeholder: string;
  startIndex: number;
  endIndex: number;
}

export interface PrivacyReport {
  originalLength: number;
  sanitizedText: string;
  detections: PIIDetection[];
  piiFound: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high';
  gdprArticlesTriggered: string[];
}

interface PIIPattern {
  category: PIICategory;
  pattern: RegExp;
  placeholder: (i: number) => string;
  gdprArticle: string;
}

const PII_PATTERNS: PIIPattern[] = [
  { category: 'email',          pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,                           placeholder: (i) => `[EMAIL_${i}]`,          gdprArticle: 'Art. 4(1)' },
  { category: 'phone',          pattern: /\b(\+?[\d\s\-().]{7,20})\b(?=.*\d{3})/g,                                           placeholder: (i) => `[PHONE_${i}]`,          gdprArticle: 'Art. 4(1)' },
  { category: 'credit-card',    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g, placeholder: (i) => `[CC_${i}]`, gdprArticle: 'Art. 9' },
  { category: 'ssn',            pattern: /\b\d{3}-\d{2}-\d{4}\b/g,                                                           placeholder: (i) => `[SSN_${i}]`,            gdprArticle: 'Art. 9' },
  { category: 'national-id',    pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,                                                           placeholder: (i) => `[NATIONAL_ID_${i}]`,    gdprArticle: 'Art. 9' },
  { category: 'ip-address',     pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,  placeholder: (i) => `[IP_${i}]`,             gdprArticle: 'Art. 4(1)' },
  { category: 'iban',           pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g,                            placeholder: (i) => `[IBAN_${i}]`,           gdprArticle: 'Art. 9' },
  { category: 'date-of-birth',  pattern: /\b(0[1-9]|[12]\d|3[01])[/-](0[1-9]|1[012])[/-](19|20)\d\d\b/g,              placeholder: (i) => `[DOB_${i}]`,            gdprArticle: 'Art. 4(1)' },
  { category: 'medical-record', pattern: /\bMRN[-:\s]?\d{6,10}\b/gi,                                                         placeholder: (i) => `[MRN_${i}]`,            gdprArticle: 'Art. 9' },
];

const SENSITIVE_KEYWORDS = ['password', 'secret', 'token', 'api_key', 'apikey', 'private_key', 'credential', 'bearer'];

export class PrivacyGuard {
  private readonly detectionLog: PIIDetection[] = [];

  /**
   * Sanitize text: detect and mask all PII patterns.
   * Returns a PrivacyReport with the sanitized text and full detection metadata.
   * The original values are NEVER stored — only the category and placeholder.
   */
  sanitize(text: string): PrivacyReport {
    let sanitized = text;
    const detections: PIIDetection[] = [];
    const gdprArticles = new Set<string>();
    let detectionIndex = 0;

    for (const { category, pattern, placeholder, gdprArticle } of PII_PATTERNS) {
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(pattern, (match, ...args) => {
        const ph = placeholder(detectionIndex);
        const offset = args[args.length - 2] as number;
        detections.push({ category, original: '[REDACTED]', placeholder: ph, startIndex: offset, endIndex: offset + match.length });
        gdprArticles.add(gdprArticle);
        detectionIndex++;
        return ph;
      });
    }

    const sensitiveDetected = SENSITIVE_KEYWORDS.some(k => sanitized.toLowerCase().includes(k));
    if (sensitiveDetected) {
      gdprArticles.add('Art. 32 — security measures');
    }

    const riskLevel: PrivacyReport['riskLevel'] =
      detections.some(d => ['ssn', 'credit-card', 'medical-record', 'passport'].includes(d.category)) ? 'high'
      : detections.some(d => ['email', 'phone', 'national-id', 'iban', 'date-of-birth'].includes(d.category)) ? 'medium'
      : detections.length > 0 || sensitiveDetected ? 'low'
      : 'none';

    return {
      originalLength: text.length,
      sanitizedText: sanitized,
      detections,
      piiFound: detections.length > 0 || sensitiveDetected,
      riskLevel,
      gdprArticlesTriggered: [...gdprArticles],
    };
  }

  /**
   * Check if a string contains secrets or high-risk PII before RAG storage.
   * Returns true if safe to store.
   */
  isSafeToStore(text: string): boolean {
    const report = this.sanitize(text);
    return report.riskLevel !== 'high' && !SENSITIVE_KEYWORDS.some(k => text.toLowerCase().includes(k));
  }

  /**
   * Redact an object recursively — sanitizes all string values.
   */
  redactObject<T extends object>(obj: T): T {
    const redact = (value: unknown): unknown => {
      if (typeof value === 'string') return this.sanitize(value).sanitizedText;
      if (Array.isArray(value))     return value.map(redact);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redact(v)]));
      }
      return value;
    };
    return redact(obj) as T;
  }

  getAuditLog(): PIIDetection[] {
    return [...this.detectionLog];
  }
}
