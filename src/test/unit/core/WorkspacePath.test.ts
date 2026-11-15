import * as nodePath from 'path';
import { toWorkspaceRelative } from '../../../core/WorkspacePath';

describe('toWorkspaceRelative (paths proposed by a model)', () => {
  const root = nodePath.resolve('/work/club-padel');

  it('keeps relative paths and normalises separators', () => {
    expect(toWorkspaceRelative('api/src/reservas.js', root)).toBe('api/src/reservas.js');
    expect(toWorkspaceRelative('./api/test/x.test.js', root)).toBe('api/test/x.test.js');
    expect(toWorkspaceRelative('api\\src\\a.js', root)).toBe(nodePath.sep === '\\' ? 'api/src/a.js' : 'api\\src\\a.js');
  });

  it('reads a leading-slash path as workspace-relative (regression: "/api/spec/x.js" became ..\\..\\api and was refused)', () => {
    expect(toWorkspaceRelative('/api/spec/003-cancel-reserva.spec.js', root)).toBe('api/spec/003-cancel-reserva.spec.js');
  });

  it('turns an absolute path inside the workspace into a relative one', () => {
    expect(toWorkspaceRelative(nodePath.join(root, 'web', 'src', 'App.jsx'), root)).toBe('web/src/App.jsx');
  });

  it('rejects paths that escape the workspace', () => {
    expect(toWorkspaceRelative('../secrets/x.js', root)).toBeNull();
    expect(toWorkspaceRelative('api/../../x.js', root)).toBeNull();
    expect(toWorkspaceRelative('//server/share/x.js', root)).toBeNull();
    if (nodePath.sep === '\\') { expect(toWorkspaceRelative('D:\\other\\x.js', root)).toBeNull(); }
  });

  it('rejects empty input, the root itself and a missing workspace', () => {
    expect(toWorkspaceRelative('', root)).toBeNull();
    expect(toWorkspaceRelative('.', root)).toBeNull();
    expect(toWorkspaceRelative('api/x.js', '')).toBeNull();
  });

  it('strips quotes and backticks that models wrap paths in', () => {
    expect(toWorkspaceRelative('`api/src/a.js`', root)).toBe('api/src/a.js');
  });
});
