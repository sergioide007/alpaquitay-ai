import * as vm from 'vm';
import { DOCS_CSS, DOCS_HTML, DOCS_JS, DOCS_TAB_BUTTON } from '../../../panel/DocsTab';

describe('Docs tab assets', () => {
  it('webview script is syntactically valid JavaScript', () => { expect(() => new vm.Script(DOCS_JS)).not.toThrow(); });
  it('is safe to interpolate into the webview template literal (no backticks or placeholders)', () => {
    for (const part of [DOCS_JS, DOCS_HTML, DOCS_CSS, DOCS_TAB_BUTTON]) { expect(part).not.toMatch(/`|\$\{/); }
  });
  it('declares the tab id the router expects', () => {
    expect(DOCS_TAB_BUTTON).toContain('data-tab="docs"');
    expect(DOCS_HTML).toContain('id="panel-docs"');
  });
});
