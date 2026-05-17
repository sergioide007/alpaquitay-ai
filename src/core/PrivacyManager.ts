import * as vscode from 'vscode';

/**
 * Manages privacy consent and anonymous telemetry.
 *
 * Design principles (GDPR Art. 25 — Privacy by Design):
 * - Telemetry OFF by default; requires explicit opt-in
 * - No code, prompts, file contents, or identifiers in telemetry
 * - User can withdraw consent at any time
 */
export class PrivacyManager {
  private readonly CONSENT_KEY = 'alpaquitay-ai.telemetry.consented';

  constructor(
    private readonly globalState: vscode.Memento,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  isTelemetryEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('alpaquitay-ai');
    return config.get<boolean>('enableTelemetry', false);
  }

  async promptConsentIfNeeded(): Promise<void> {
    if (this.globalState.get<boolean>(this.CONSENT_KEY) !== undefined) {
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      'Alpaquitay AI: Help improve the extension by sharing anonymous usage statistics? ' +
      'No code or prompts are ever sent. You can change this in settings.',
      'Yes, opt in',
      'No thanks',
      'View Privacy Policy'
    );

    if (choice === 'View Privacy Policy') {
      vscode.env.openExternal(
        vscode.Uri.parse('https://github.com/sergioide007/alpaquitay-ai/blob/main/PRIVACY.md')
      );
      return;
    }

    const opted = choice === 'Yes, opt in';
    await this.globalState.update(this.CONSENT_KEY, opted);

    if (opted) {
      await vscode.workspace.getConfiguration('alpaquitay-ai').update(
        'enableTelemetry', true, vscode.ConfigurationTarget.Global
      );
    }
  }

  recordEvent(event: string, properties?: Record<string, string | number | boolean>): void {
    if (!this.isTelemetryEnabled()) {
      return;
    }
    // In production: send to a privacy-safe telemetry endpoint
    // Only anonymous metadata — never code, prompts, or identifiers
    this.outputChannel.appendLine(
      `[telemetry] ${event} ${properties ? JSON.stringify(properties) : ''}`
    );
  }
}
