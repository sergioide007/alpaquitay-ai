import { MainPanel } from '../../../panel/MainPanel';

describe('MainPanel changes webview', () => {
  it('generates a syntactically valid script with live file diff handling', () => {
    const panel = Object.create(MainPanel.prototype) as any;
    const script = panel._htmlScript();
    const body = panel._htmlBody();

    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain("case 'agent-file-change'");
    expect(script).toContain('function appendFileChange');
    expect(body).toContain('data-tab="changes"');
    expect(body).toContain('<div class="panel" id="panel-changes">');
    expect(body).not.toContain('<div class="panel active" id="panel-changes">');
  });
});
