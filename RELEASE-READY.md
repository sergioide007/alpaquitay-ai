# 🚀 Alpaquitay AI v3.2.0 — Release Ready

## Estado: ✅ LISTO PARA MARKETPLACE

### Resumen de validación

| Check | Estado |
|-------|--------|
| Compilación TypeScript | ✅ |
| Tests (328 passing, 36 suites) | ✅ |
| Package.json campos requeridos | ✅ |
| Icono PNG 1024x1024 | ✅ |
| LICENSE (MIT) | ✅ |
| CHANGELOG.md | ✅ |
| HARNESS.md | ✅ |
| Sin eval()/new Function | ✅ |
| Dependencias auditadas | ✅ (3 menores en testing) |
| .vsix generado (778KB) | ✅ |

### Archivos de despliegue creados

| Archivo | Propósito |
|---------|-----------|
| `.github/workflows/release.yml` | CI/CD: test → package → publish |
| `.vscode/launch.json` | F5 Extension Development Host |
| `.vscode/settings.json` | Configuración de desarrollo |
| `.vscode/tasks.json` | Tareas compile/test/watch |
| `.vscode/extensions.json` | Extensiones recomendadas |
| `scripts/release.js` | Build local con validaciones |
| `scripts/verify-marketplace.js` | Verificación completa marketplace |
| `HARNESS.md` | Documentación del harness |
| `CHANGELOG.md` | v3.2.0 documentada |

### Opción C — Desarrollo local (F5)

1. Abrir carpeta en VS Code
2. Presionar **F5** → Extension Development Host
3. En la nueva ventana: `Ctrl+Alt+A` para abrir Alpaquitay Hub
4. Probar: `onboard`, `dora`, `deuda`, `economía`, `postmortem`, `diff`, `si aplicar`, `no`, `promover`, `si`

### Comandos de desarrollo

```bash
# Compilar
npm run compile

# Tests
npm test

# Verificar marketplace
node scripts/verify-marketplace.js

# Build local
node scripts/release.js

# Paquete .vsix
npx vsce package --out alpaquitay-ai-v3.2.0.vsix
```

### Despliegue

```bash
# Opción A — GitHub Actions (automático)
git add -A
git commit -m "chore: release v3.2.0 — Astra harness"
git tag v3.2.0
git push origin main --tags

# Opción B — Manual
npx vsce publish --packagePath alpaquitay-ai-v3.2.0.vsix
npx ovsx publish alpaquitay-ai-v3.2.0.vsix
```

### Secretos necesarios (GitHub)

- `VSCE_PAT` — dev.azure.com → Personal Access Tokens
- `OVSX_PAT` — open-vsx.org → Access Tokens

---

**Harness implementado:** Fingerprint-first · Ask-before-act · Bounded preview · Legible-first · Evidence-always

**Código Sintético:** Capítulos 01/03/04/05/08/09/10/11/12/13/14/17 implementados
