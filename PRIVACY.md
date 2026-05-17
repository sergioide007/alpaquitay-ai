# Privacy Policy — Alpaquitay AI VS Code Extension

**Last updated:** 2026-05-16  
**Version:** 2.0.0

---

## Summary

Alpaquitay AI is **privacy-first by design**. Your code and prompts are sent **only** to the AI provider you explicitly configure. We collect **zero data** by default. Telemetry is strictly opt-in.

---

## 1. Data Controller

Alpaquitay AI is open-source software distributed under the MIT License. The extension operates entirely within your machine and your chosen AI provider accounts. There is no central Alpaquitay AI server.

---

## 2. What Data Is Processed

### 2.1 Your Code & Prompts
- Sent **directly** from your machine to your configured AI provider (Anthropic, OpenAI, Ollama, etc.)
- We never proxy, store, or log your code or prompts
- Local providers (Ollama, LM Studio) keep everything 100% on-device

### 2.2 API Keys
- Stored exclusively in **VS Code SecretStorage** (OS-level encrypted keychain)
- Never written to disk in plaintext, never included in settings sync, never transmitted to us

### 2.3 Anonymous Telemetry (opt-in only)
- **Disabled by default** — must be explicitly enabled via `alpaquitay-ai.enableTelemetry: true`
- If enabled, only collects: extension version, VS Code version, OS platform (Windows/macOS/Linux), which AI provider type (local/cloud) — never model names, prompts, file contents, or identifiers
- You can disable telemetry at any time

---

## 3. Legal Basis (GDPR — EU/EEA Users)

Under the General Data Protection Regulation (EU) 2016/679:

| Processing activity | Legal basis |
|---|---|
| AI requests via your API key | Contract performance (Art. 6(1)(b)) — you configured the provider |
| Telemetry (if opted in) | Consent (Art. 6(1)(a)) |

**No personal data** is processed by Alpaquitay AI itself. AI providers have their own privacy policies and data processing agreements.

---

## 4. CCPA / US Privacy Rights

California residents: Alpaquitay AI does not sell, share, or rent your personal information. Telemetry (if opted in) is not "selling" under CCPA. You may opt out at any time by setting `alpaquitay-ai.enableTelemetry: false`.

---

## 5. Data Minimization

We apply the principle of data minimization:
- The extension only reads files you explicitly open or reference in prompts
- No background scanning of your workspace without your action
- Auto-analyze on save is **disabled by default**

---

## 6. Third-Party AI Providers

When you send a request to a cloud AI provider, their privacy policy applies:

- **Anthropic**: https://www.anthropic.com/privacy
- **OpenAI**: https://openai.com/policies/privacy-policy
- **Ollama / LM Studio**: Fully local — no data leaves your machine

We recommend using local providers for sensitive codebases.

---

## 7. Your Rights (GDPR)

If you are in the EU/EEA, you have the right to:
- **Access** data we hold about you — we hold none
- **Erasure** — disable telemetry to stop any collection
- **Portability** — your VS Code settings are fully portable
- **Object** — opt out of telemetry at any time

---

## 8. Children's Privacy

Alpaquitay AI is not directed at children under 16 (EU) or 13 (US). We do not knowingly collect data from minors.

---

## 9. Changes to This Policy

We will update this document and increment the extension version when the privacy policy changes. Breaking changes to data handling will always require a new opt-in.

---

## 10. Contact

Open an issue at: https://github.com/sergioide007/alpaquitay-ai/issues

For GDPR data requests, include "GDPR Request" in the issue title.
