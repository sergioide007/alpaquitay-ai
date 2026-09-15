import { AIProvider, ChatOptions, Message, ProviderType } from '../../../core/interfaces';
import {
  PrivacyBoundaryProvider,
  withPrivacyBoundary,
} from '../../../providers/PrivacyBoundaryProvider';

function makeProvider(type: ProviderType): jest.Mocked<AIProvider> {
  return {
    name: `Mock ${type}`,
    type,
    modelName: 'mock-model',
    isAvailable: jest.fn().mockResolvedValue(true),
    chat: jest.fn().mockResolvedValue({
      content: 'ok',
      model: 'mock-model',
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
    complete: jest.fn().mockResolvedValue('ok'),
  };
}

describe('PrivacyBoundaryProvider', () => {
  it.each(['ollama', 'lmstudio'] as const)(
    'leaves local %s provider calls and inputs unchanged',
    async type => {
      const provider = makeProvider(type);
      const messages: Message[] = [{ role: 'user', content: 'Email jane@example.com' }];
      const options: ChatOptions = { systemPrompt: 'Bearer local-secret-token' };

      const protectedProvider = withPrivacyBoundary(provider);
      await protectedProvider.chat(messages, options);

      expect(protectedProvider).toBe(provider);
      expect(provider.chat).toHaveBeenCalledWith(messages, options);
    }
  );

  it('redacts PII and obvious secrets immediately before a cloud completion', async () => {
    const provider = makeProvider('anthropic');
    const protectedProvider = withPrivacyBoundary(provider) as PrivacyBoundaryProvider;
    const email = 'jane@example.com';
    const apiKey = 'sk-1234567890abcdefgh';
    const password = 'correct-horse-battery-staple';
    const systemToken = 'eyJabcdefghij.abcdefghijkl.abcdefghijkl';
    const prompt = `Contact ${email}; api_key=${apiKey}; password="${password}"`;

    await protectedProvider.complete(prompt, { systemPrompt: `Use ${systemToken}` });

    const [transmittedPrompt, transmittedOptions] = provider.complete.mock.calls[0];
    expect(transmittedPrompt).not.toContain(email);
    expect(transmittedPrompt).not.toContain(apiKey);
    expect(transmittedPrompt).not.toContain(password);
    expect(transmittedPrompt).toContain('[EMAIL_0]');
    expect(transmittedPrompt).toContain('[SECRET_');
    expect(transmittedOptions?.systemPrompt).not.toContain(systemToken);

    const disclosure = protectedProvider.getLastDisclosure();
    expect(disclosure).toMatchObject({
      providerType: 'anthropic',
      operation: 'complete',
      destination: 'cloud',
      sanitized: true,
    });
    expect(disclosure?.redactionCount).toBeGreaterThanOrEqual(4);
    const serializedDisclosure = JSON.stringify(disclosure);
    expect(serializedDisclosure).not.toContain(email);
    expect(serializedDisclosure).not.toContain(apiKey);
    expect(serializedDisclosure).not.toContain(password);
    expect(serializedDisclosure).not.toContain(systemToken);
  });

  it('sanitizes every cloud chat field without mutating caller-owned input', async () => {
    const provider = makeProvider('openai');
    const protectedProvider = withPrivacyBoundary(provider) as PrivacyBoundaryProvider;
    const messages: Message[] = [
      { role: 'system', content: 'Operator: ops@example.com' },
      { role: 'user', content: 'Authorization: Bearer abcdefghijklmnop' },
    ];
    const options: ChatOptions = { systemPrompt: 'Call +1 (415) 555-2671' };

    await protectedProvider.chat(messages, options);

    const [transmittedMessages, transmittedOptions] = provider.chat.mock.calls[0];
    expect(transmittedMessages[0].content).not.toContain('ops@example.com');
    expect(transmittedMessages[1].content).not.toContain('abcdefghijklmnop');
    expect(transmittedOptions?.systemPrompt).not.toContain('+1 (415) 555-2671');
    expect(messages[0].content).toBe('Operator: ops@example.com');
    expect(messages[1].content).toBe('Authorization: Bearer abcdefghijklmnop');
    expect(options.systemPrompt).toBe('Call +1 (415) 555-2671');
  });

  it('does not stack multiple privacy decorators', () => {
    const protectedProvider = withPrivacyBoundary(makeProvider('openai'));
    expect(withPrivacyBoundary(protectedProvider)).toBe(protectedProvider);
  });
});
