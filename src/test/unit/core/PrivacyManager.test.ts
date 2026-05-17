import { PrivacyManager } from '../../../core/PrivacyManager';
import * as vscode from 'vscode';

function makeMemento(store: Record<string, unknown> = {}): vscode.Memento {
  return {
    get: jest.fn(<T>(key: string, defaultValue?: T): T => (key in store ? store[key] as T : defaultValue as T)),
    update: jest.fn((key: string, value: unknown) => {
      store[key] = value;
      return Promise.resolve();
    }),
    keys: jest.fn(() => Object.keys(store))
  };
}

function makeChannel(): vscode.OutputChannel {
  return { appendLine: jest.fn(), show: jest.fn(), dispose: jest.fn() } as unknown as vscode.OutputChannel;
}

describe('PrivacyManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: telemetry disabled
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string, defaultValue: unknown) => {
        if (key === 'enableTelemetry') { return false; }
        return defaultValue;
      }),
      update: jest.fn().mockResolvedValue(undefined)
    });
  });

  describe('isTelemetryEnabled()', () => {
    it('When enableTelemetry setting is false, Then returns false', () => {
      const pm = new PrivacyManager(makeMemento(), makeChannel());
      expect(pm.isTelemetryEnabled()).toBe(false);
    });

    it('When enableTelemetry setting is true, Then returns true', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn(() => true),
        update: jest.fn().mockResolvedValue(undefined)
      });
      const pm = new PrivacyManager(makeMemento(), makeChannel());
      expect(pm.isTelemetryEnabled()).toBe(true);
    });
  });

  describe('recordEvent()', () => {
    it('When telemetry is disabled, Then does NOT write to output channel', () => {
      const channel = makeChannel();
      const pm = new PrivacyManager(makeMemento(), channel);
      pm.recordEvent('command.openChat');
      expect(channel.appendLine).not.toHaveBeenCalled();
    });

    it('When telemetry is enabled, Then writes event to output channel', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn(() => true),
        update: jest.fn()
      });
      const channel = makeChannel();
      const pm = new PrivacyManager(makeMemento(), channel);
      pm.recordEvent('command.openChat', { language: 'typescript' });
      expect(channel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('command.openChat')
      );
    });

    it('When telemetry is enabled with properties, Then includes them in the log', () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn(() => true),
        update: jest.fn()
      });
      const channel = makeChannel();
      const pm = new PrivacyManager(makeMemento(), channel);
      pm.recordEvent('test.event', { foo: 'bar', count: 42 });
      const logged = (channel.appendLine as jest.Mock).mock.calls[0][0] as string;
      expect(logged).toContain('foo');
      expect(logged).toContain('bar');
    });
  });

  describe('promptConsentIfNeeded()', () => {
    it('When consent has already been recorded, Then does NOT show dialog', async () => {
      const store: Record<string, unknown> = { 'alpaquitay-ai.telemetry.consented': false };
      const pm = new PrivacyManager(makeMemento(store), makeChannel());
      await pm.promptConsentIfNeeded();
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('When consent is not recorded, Then shows the opt-in dialog', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('No thanks');
      const pm = new PrivacyManager(makeMemento(), makeChannel());
      await pm.promptConsentIfNeeded();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('anonymous'),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('When user clicks "No thanks", Then saves consent=false and does not enable telemetry', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('No thanks');
      const store: Record<string, unknown> = {};
      const pm = new PrivacyManager(makeMemento(store), makeChannel());
      await pm.promptConsentIfNeeded();
      expect(store['alpaquitay-ai.telemetry.consented']).toBe(false);
    });

    it('When user clicks "Yes, opt in", Then enables telemetry in settings', async () => {
      const mockConfig = {
        get: jest.fn(() => false),
        update: jest.fn().mockResolvedValue(undefined)
      };
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('Yes, opt in');
      const store: Record<string, unknown> = {};
      const pm = new PrivacyManager(makeMemento(store), makeChannel());
      await pm.promptConsentIfNeeded();
      expect(store['alpaquitay-ai.telemetry.consented']).toBe(true);
      expect(mockConfig.update).toHaveBeenCalledWith('enableTelemetry', true, expect.anything());
    });

    it('When user clicks "View Privacy Policy", Then opens external URL and does not save consent yet', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('View Privacy Policy');
      const store: Record<string, unknown> = {};
      const pm = new PrivacyManager(makeMemento(store), makeChannel());
      await pm.promptConsentIfNeeded();
      expect(vscode.env.openExternal).toHaveBeenCalled();
      expect(store['alpaquitay-ai.telemetry.consented']).toBeUndefined();
    });
  });
});