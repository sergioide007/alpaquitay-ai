#!/bin/bash
# Release script v3.2.0 — ejecutar: bash scripts/release-git.sh
set -e

VERSION="3.2.0"
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
  git commit -m "chore: release $VERSION — Astra harness (FABLE-5)

- WorkspaceFingerprinter: fingerprint-first, never assumes src/
- Decider: 3 lanes (Flash/Build/Deep) with SDLC phases
- FileDiff: unified diff pre-write, bounded preview
- AgentReview: pre-apply review (security, scope, SRP)
- DebtTracker: agentic debt with ceiling (blocks Build at 100)
- Economy: session cost tracking (LLM vs local)
- PolicyGuard: deny secrets, confirm risky writes
- CheckpointManager: git stash before write
- DecisionLog: evidence-always in decisions.jsonl
- PlatformContract: verified golden paths per stack
- Postmortem: blameless failure classification
- IdeaInbox: capture ideas before spec.md
- Onboard: one-command legacy onboarding
- 328 tests passing (36 suites)
- GitHub Actions: Node 22, concurrency, combined jobs"
  echo "✅ Commit creado"
else
  echo "✅ Sin cambios pendientes"
fi

# 3. Crear tag
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "⚠️  Tag $TAG ya existe. Eliminando..."
  git tag -d "$TAG"
fi
git tag -a "$TAG" -m "Release $VERSION — Astra harness for VS Code

FABLE-5 Framework:
- Fingerprint-first (no src/ assumption)
- Ask-before-act (confirmation gates)
- Bounded preview (diff-first writes)
- Legible-first (chips with full context)
- Evidence-always (decision audit log)

SDLC: 6 phases with executable gates
DORA: metrics from git log
Debt: tracked with ceiling (blocks Build)
Review: pre-apply agent review
Economy: session cost visibility

328 tests passing. Ready for marketplace."
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
echo "   1. Tests (328)"
echo "   2. Package .vsix"
echo "   3. Publish VS Code Marketplace"
echo "   4. Publish Open VSX"
echo ""
echo "🔗 Verificar: https://github.com/sergioide007/alpaquitay-ai/actions"
