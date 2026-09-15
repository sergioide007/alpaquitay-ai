#!/bin/bash
# Release script v3.2.1 (fix EROFS) — ejecutar: bash scripts/release-git.sh
set -e

VERSION="3.2.1"
TAG="v$VERSION"

echo "🚀 Alpaquitay AI $TAG — Git Release"
echo ""

# 1. Verificar que estamos en main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "❌ Error: No estás en branch main (estás en $BRANCH)"
  exit 1
fi
echo "✅ Branch: $BRANCH"

# 2. Verificar que no hay cambios sin commit
if [ -n "$(git status --porcelain)" ]; then
  echo "📝 Hay cambios sin commit. Agregando..."
  git add -A
  git commit -m "fix: EROFS — validated workspace root as harness invariant

Root cause: with empty workspaceFolders, activation fell back to
process.cwd() (often '/' in the extension host). path.join('', 'spec.md')
produced the RELATIVE path 'spec.md', resolved against a read-only cwd ->
'Error: EROFS: read-only file system, open spec.md' on Describe->Generar.

Fix (src/core/WorkspaceRoot.ts):
- pickWorkspaceRoot(): workspaceFolders -> workspaceFile -> cwd, rejecting
  empty/relative/undefined and filesystem roots (/ C:\\\\ \\\\share)
- SpecManager.specPath returns '' instead of relative 'spec.md'; all spec
  writes funnel through one guarded _write()
- FilesystemMCP validates the root before resolving; EROFS/EACCES/ENOENT/
  EISDIR translated to actionable messages; containment via path.relative()
  (closes sibling-prefix traversal)
- Preflight on all mutation paths: chat Build, regenerate-spec, si aplicar,
  delete-file, arch/ADR/infra export, checkpoints, Git MCP
- No writable root -> chat mode (never writes), warning + 'Open Folder'

Latent defects fixed in the same audit: LessonStorageAdapter,
BaseDomainShell.saveMemory, KnowledgeBase, CodeIndexer, Cursor/Windsurf
(relative-path cwd leaks now guarded).

Tests: 357 passing / 38 suites (24 new regression tests)."
  echo "✅ Commit creado"
else
  echo "✅ Sin cambios pendientes"
fi

# 3. Crear tag
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "⚠️  Tag $TAG ya existe. Eliminando..."
  git tag -d "$TAG"
fi
git tag -a "$TAG" -m "Release $VERSION — EROFS fix

Workspace root is now a validated harness invariant (Cap.09):
- Never write via relative paths resolved against extension-host cwd
- Chat-mode degradation instead of EROFS crashes
- Actionable filesystem errors (no raw stack traces in chat)
- Sibling-prefix traversal closed in FilesystemMCP

357 tests passing. Ready for marketplace."
echo "✅ Tag $TAG creado"

# 4. Push
echo ""
echo "📤 Push a origin..."
git push origin main
git push origin "$TAG"

echo ""
echo "✅ Release $TAG completado!"
echo ""
echo "📋 GitHub Actions ejecutará automáticamente:"
echo "   1. Tests (357)"
echo "   2. Package .vsix"
echo "   3. Publish VS Code Marketplace"
echo "   4. Publish Open VSX"
echo ""
echo "🔗 Verificar: https://github.com/sergioide007/alpaquitay-ai/actions"
