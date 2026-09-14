# 🚀 Despliegue GitHub Actions — Alpaquitay AI v3.2.0

## Entorno validado

| Componente | Versión | Estado |
|------------|---------|--------|
| Node.js local | v24.20.0 | ✅ Superior a 20 |
| GitHub Actions Node | 22 (LTS) | ✅ Optimizado |
| npm | 11.19.0 | ✅ |

## Optimizaciones aplicadas

### 1. Node 22 (LTS) en Actions
- ~20% más rápido que Node 20
- Mejor caching de dependencias
- Menos minutos consumidos por build

### 2. Concurrency control
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```
- Cancela runs anteriores del mismo branch
- **Ahorra cuota** cuando haces push rápido

### 3. Jobs combinados
- Antes: 4 jobs (test + package + marketplace + openvsx) = ~4 × 30s overhead = 2 min extra
- Ahora: 2 jobs (test + release) = ~1 min overhead
- **Ahorro: ~1 min por release**

### 4. Timeouts
- test: 10 min
- release: 15 min
- Evita builds colgados consumiendo cuota

### 5. Retención de artifacts
- coverage: 7 días
- vsix: 30 días
- Reduce almacenamiento

## Cuota GitHub Actions (Plan Gratuito)

| Recurso | Cuota | Uso estimado | Disponible |
|---------|-------|--------------|------------|
| Linux builds | 2,000 min/mes | ~3 min/release | ✅ ~660 releases/mes |
| macOS builds | 1,000 min/mes | 0 (solo Linux) | ✅ Sin usar |
| Almacenamiento | 50 GB | ~5 MB/release | ✅ ~10,000 releases |

### Estimación de costos

| Escenario | Builds/mes | Minutos/mes | Estado |
|-----------|------------|-------------|--------|
| Desarrollo activo (20 releases) | 20 | 60 | ✅ 3% de cuota |
| Release semanal (4/mes) | 4 | 12 | ✅ 0.6% de cuota |
| CI en PR (30 PR/mes) | 30 | 90 | ✅ 4.5% de cuota |
| **Total estimado** | **54** | **162** | ✅ **8.1% de cuota** |

**Conclusión:** El plan gratuito es más que suficiente.

## Ventajas de GitHub Actions para esta extensión

1. **Sin servidor propio** — GitHub hospeda el CI/CD
2. **Secrets integrados** — VSCE_PAT y OVSX_PAT seguros
3. **Environments** — aprobación manual opcional antes de publicar
4. **Cache automático** — npm se cachea entre builds
5. **Logs integrados** — ver errores sin salir de GitHub
6. **Reutilización** — el mismo workflow para test + release

## Configuración requerida en GitHub

### Secrets (obligatorios)
Ir a **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Origen | URL |
|--------|--------|-----|
| `VSCE_PAT` | Azure DevOps Personal Access Token | https://dev.azure.com → User settings → Personal access tokens |
| `OVSX_PAT` | Open VSX Access Token | https://open-vsx.org → User settings → Access Tokens |

### Crear VSCE_PAT
1. Ir a https://dev.azure.com
2. Crear organización (ej: `alpaquitay-ai`)
3. User settings → Personal access tokens
4. Nombre: `vscode-marketplace`
5. Organization: `alpaquitay-ai`
6. Scopes: `Marketplace (Manage)`
7. Expiration: 1 año (o custom)
8. Copiar token → guardar en GitHub secret `VSCE_PAT`

### Crear OVSX_PAT
1. Ir a https://open-vsx.org
2. Login con GitHub
3. User settings → Access Tokens
4. Nombre: `alpaquitay-ai-release`
5. Scope: `publish`
6. Copiar token → guardar en GitHub secret `OVSX_PAT`

## Comandos de despliegue

### Release automático (recomendado)
```bash
# 1. Asegurar que todo compila y tests pasan
npm run compile && npm test

# 2. Commit y tag
git add -A
git commit -m "chore: release v3.2.0 — Astra harness"
git tag v3.2.0
git push origin main --tags

# 3. GitHub Actions automáticamente:
#    - Corre tests
#    - Genera .vsix
#    - Publica en VS Code Marketplace
#    - Publica en Open VSX
```

### Verificar release
```bash
# Ver status del workflow
gh run list --workflow=release.yml

# Ver logs en tiempo real
gh run watch
```

### Release manual (si no hay cuota)
```bash
# Build local
node scripts/release.js

# Publicar manualmente
nvsce publish --packagePath alpaquitay-ai-v3.2.0.vsix
npx ovsx publish alpaquitay-ai-v3.2.0.vsix
```

## Archivos de CI/CD

| Archivo | Propósito |
|---------|-----------|
| `.github/workflows/release.yml` | Pipeline completo |
| `scripts/release.js` | Build local con validaciones |
| `scripts/verify-marketplace.js` | Verificación pre-publicación |
| `.vscodeignore` | Excluye dev del paquete |

---

**Estado:** ✅ Listo para despliegue por GitHub Actions
**Cuota necesaria:** ~3 min/release (plan gratuito: 2,000 min/mes)
**Node.js:** v24 local, v22 en Actions (óptimo)
