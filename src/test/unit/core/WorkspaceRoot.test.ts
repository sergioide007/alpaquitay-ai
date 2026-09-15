/**
 * Regresion del fix EROFS: `Error: EROFS: read-only file system, open 'spec.md'`.
 *
 * Causa raiz: cuando `workspaceFolders` no existia, el harness caia a `process.cwd()`
 * (en el extension host puede ser `/` o un FS de solo lectura). `path.join('', 'spec.md')`
 * producia la ruta relativa `'spec.md'`, que Node resolvia contra ese cwd -> EROFS.
 *
 * Invariante cubierto (Codigo Sintetico Cap.09):
 *   - Nunca se asume `src/` ni el cwd: la raiz se evidencia y se valida.
 *   - Sin carpeta de trabajo escribible, el harness NO escribe y explica como resolverlo.
 */
import {
  pickWorkspaceRoot, isUsableRoot, isAbsolutePath, assertWritableRoot,
  friendlyFsError, workspaceRootHelp, rootLabel, WorkspaceRootError,
  isReadOnlyFsError
} from '../../../core/WorkspaceRoot';

describe('WorkspaceRoot (fix EROFS)', () => {
  describe('isUsableRoot', () => {
    it('Given una carpeta absoluta real, When se evalua, Then es usable', () => {
      expect(isUsableRoot('/home/dev/proyecto')).toBe(true);
      expect(isUsableRoot('C:\\dev\\proyecto')).toBe(true);
    });

    it('Given la raiz del sistema de archivos, When se evalua, Then NO es usable', () => {
      expect(isUsableRoot('/')).toBe(false);
      expect(isUsableRoot('C:\\')).toBe(false);
      expect(isUsableRoot('C:')).toBe(false);
    });

    it('Given una ruta vacia, relativa o indefinida, Then NO es usable', () => {
      expect(isUsableRoot('')).toBe(false);
      expect(isUsableRoot('undefined')).toBe(false);
      expect(isUsableRoot('spec.md')).toBe(false);
      expect(isUsableRoot(undefined)).toBe(false);
      expect(isUsableRoot(null)).toBe(false);
      expect(isUsableRoot('   ')).toBe(false);
    });
  });

  describe('pickWorkspaceRoot', () => {
    it('Given carpeta de workspace valida, Then gana sobre el cwd', () => {
      const r = pickWorkspaceRoot([
        { source: 'workspaceFolders', path: '/home/dev/app' },
        { source: 'cwd', path: '/' },
      ]);
      expect(r).toEqual({ root: '/home/dev/app', source: 'workspaceFolders', writable: true });
    });

    it('Given carpeta invalida y cwd `/`, Then NO hay raiz escribible (modo chat)', () => {
      const r = pickWorkspaceRoot([
        { source: 'workspaceFolders', path: undefined },
        { source: 'workspaceFile', path: '' },
        { source: 'cwd', path: '/' },
      ]);
      expect(r.root).toBe('');
      expect(r.source).toBe('none');
      expect(r.writable).toBe(false);
    });

    it('Given workspaceFile de un archivo, Then se usa su directorio', () => {
      const r = pickWorkspaceRoot([
        { source: 'workspaceFolders', path: '' },
        { source: 'workspaceFile', path: '/home/dev/app' },
      ]);
      expect(r.root).toBe('/home/dev/app');
      expect(r.source).toBe('workspaceFile');
    });
  });

  describe('assertWritableRoot', () => {
    it('Given raiz invalida, When se valida, Then lanza WorkspaceRootError accionable', () => {
      expect(() => assertWritableRoot('/')).toThrow(WorkspaceRootError);
      expect(() => assertWritableRoot('')).toThrow(/Abre una carpeta de trabajo/);
    });

    it('Given raiz valida, When se valida, Then no lanza', () => {
      expect(() => assertWritableRoot('/home/dev/app')).not.toThrow();
    });
  });

  describe('friendlyFsError', () => {
    it('Given error EROFS, Then explica el read-only y como resolverlo', () => {
      const msg = friendlyFsError({ code: 'EROFS' }, 'spec.md');
      expect(msg).toMatch(/solo lectura/i);
      expect(msg).toMatch(/raiz del workspace/i);
    });

    it('Given error EACCES, Then explica permisos', () => {
      expect(friendlyFsError({ code: 'EACCES' }, 'x.ts')).toMatch(/permisos/i);
    });

    it('Given error desconocido, Then devuelve el mensaje original', () => {
      expect(friendlyFsError(new Error('boom'), 'x.ts')).toBe('boom');
    });

    it('Given un error de Node con code, Then isReadOnlyFsError lo reconoce', () => {
      expect(isReadOnlyFsError({ code: 'EROFS' })).toBe(true);
      expect(isReadOnlyFsError({ code: 'ENOENT' })).toBe(false);
      expect(isReadOnlyFsError(new Error('x'))).toBe(false);
    });
  });

  describe('workspaceRootHelp / rootLabel', () => {
    it('Then el mensaje guia explica abrir una carpeta', () => {
      expect(workspaceRootHelp()).toMatch(/Open Folder/);
    });

    it('Then rootLabel no expone rutas absolutas largas', () => {
      expect(rootLabel('/home/dev/alpaquitay-ai')).toBe('alpaquitay-ai');
      expect(rootLabel('')).toBe('sin-carpeta');
      expect(rootLabel('/')).toBe('sin-carpeta');
    });

    it('Then isAbsolutePath distingue POSIX y Windows', () => {
      expect(isAbsolutePath('/a')).toBe(true);
      expect(isAbsolutePath('C:\\a')).toBe(true);
      expect(isAbsolutePath('rel/x')).toBe(false);
    });
  });
});