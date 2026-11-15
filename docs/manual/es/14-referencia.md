---
title: Referencia de comandos, atajos y ajustes
nav: Referencia
description: Todos los comandos, atajos de teclado y ajustes de Alpaquitay AI con sus valores por defecto.
---

# Referencia de comandos, atajos y ajustes

## Comandos

Todos están en la paleta de comandos (<kbd>F1</kbd>) con el prefijo **Alpaquitay AI:**.

| Comando | Atajo | Qué hace |
|---|---|---|
| Open Alpaquitay Hub | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd> | Abre el panel principal. |
| Show Alpaquitay Commands | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> | Menú rápido con los comandos principales. |
| New Specification | — | Crea una especificación desde una plantilla en `specs/`. |
| Generate from Specification | — | Genera código desde un archivo de especificación (escribe directamente). |
| Validate Against Specification | — | Comprueba el código frente a una especificación. |
| Generate Specification (Local Model) | — | Escribe una especificación con el modelo local, en tu GPU. |
| Clear Local Model Cache | — | Borra los archivos del modelo guardados en caché. |
| Configure AI Provider | — | Guarda una clave de API o configura un servidor local. |

En macOS, usa <kbd>Cmd</kbd> en lugar de <kbd>Ctrl</kbd>.

## Comandos del chat

`onboard` · `dora` · `deuda` · `economía` · `postmortem <texto>` · `diff <ruta>` · `si aplicar` · `no` · `promover` · `si`. Detalle en [Comandos del chat](../comandos-chat/).

## Ajustes

Se cambian en la interfaz de ajustes de VS Code, en `settings.json` o, los del proveedor, en la pestaña **Settings** del Hub.

### Proveedor y modelo

| Ajuste | Por defecto | Descripción |
|---|---|---|
| `alpaquitay-ai.preferredProvider` | `auto` | `auto`, `ollama`, `lmstudio`, `local-wasm`, `anthropic` u `openai`. `auto` prueba primero los locales. |
| `alpaquitay-ai.anthropic.model` | `claude-opus-5-5` | Identificador del modelo de Anthropic. |
| `alpaquitay-ai.anthropic.baseUrl` | `https://api.anthropic.com/v1` | Para proxies o APIs compatibles. |
| `alpaquitay-ai.openai.model` | `gpt-6.1-sol` | Identificador del modelo de OpenAI. |
| `alpaquitay-ai.openai.baseUrl` | `https://api.openai.com/v1` | Para Azure OpenAI o proxies. |
| `alpaquitay-ai.ollama.endpoint` | `http://localhost:11434` | Dirección del servidor Ollama. |
| `alpaquitay-ai.ollama.model` | `codellama` | Modelo de Ollama. |
| `alpaquitay-ai.lmstudio.endpoint` | `http://localhost:1234` | Dirección del servidor LM Studio. |
| `alpaquitay-ai.maxTokens` | `4096` | Máximo de tokens por petición. |
| `alpaquitay-ai.temperature` | `0.3` | 0 = determinista, 2 = creativo. |
| `alpaquitay-ai.requestTimeout` | `120000` | Tiempo máximo por petición, en milisegundos. |
| `alpaquitay-ai.systemPrompt` | vacío | Instrucciones globales para todas las peticiones. |
| `alpaquitay-ai.orgContext` | vacío | Nombre o contexto de tu organización. |

### Proyecto y herramientas

| Ajuste | Por defecto | Descripción |
|---|---|---|
| `alpaquitay-ai.specFile` | `spec.md` | Archivo de especificación en la raíz (por ejemplo `tasks.md`). |
| `alpaquitay-ai.skill.maxParallel` | `3` | Máximo de skills en paralelo. |
| `alpaquitay-ai.mcp.filesystem.enabled` | `true` | Permite a la IA leer y escribir archivos del workspace. |
| `alpaquitay-ai.mcp.git.enabled` | `true` | Permite a la IA leer el historial de Git. |
| `alpaquitay-ai.indexing.enabled` | `false` | Indexado del workspace (próximamente). |
| `alpaquitay-ai.enableTelemetry` | `false` | Estadísticas anónimas de uso. Nunca código ni *prompts*. |

### Motor local

`enabled`, `modelId`, `cdnBaseUrl` y `extraTrustedKeys` solo se leen de tu **configuración de usuario** (ámbito de aplicación): un proyecto que abras no puede activar el motor, cambiar el modelo, redirigir la descarga ni añadir claves.

| Ajuste | Por defecto | Descripción |
|---|---|---|
| `alpaquitay-ai.localEngine.enabled` | `false` | Usar el motor local como proveedor. |
| `alpaquitay-ai.localEngine.modelId` | `qwen2.5-coder-1.5b-instruct` | Modelo bajo `/models/` en el CDN. |
| `alpaquitay-ai.localEngine.cdnBaseUrl` | `https://alpaquitay.specsolid.com` | CDN de los modelos (https). |
| `alpaquitay-ai.localEngine.extraTrustedKeys` | `[]` | Claves públicas Ed25519 adicionales (espejo propio). |
| `alpaquitay-ai.localEngine.device` | `auto` | `auto`, `webgpu` o `wasm`. |
| `alpaquitay-ai.localEngine.dtype` | `auto` | `auto`, `q4`, `q4f16`, `q8`, `fp16` o `fp32`. |
| `alpaquitay-ai.localEngine.maxNewTokens` | `1024` | Máximo de tokens nuevos por generación local. |

### Un ajuste de VS Code que conviene conocer

| Ajuste | Para qué |
|---|---|
| `window.dialogStyle` | `native` (por defecto) muestra los diálogos modales, como la confirmación de descarga del modelo, como ventanas del sistema. `custom` los dibuja dentro de VS Code. |

## Archivos que escribe Alpaquitay

| Ruta | Quién la escribe |
|---|---|
| `spec.md` | Tú, *Create with AI*, *Regen*, `promover`, una petición de código confirmada en el chat (reemplaza el archivo) y el tablero al cerrar tareas. |
| `specs/*.md` | *New Specification* y *Generate Specification (Local Model)*. |
| `infra/main.*` | *Export as IaC* en Architecture. |
| `*.edited.*` | El agente de Docs al aplicar cambios (salvo que elijas sobrescribir). |
| `.alpaquitay/` | El arnés: decisiones, deuda, economía, huella, plataforma, ADR, memoria, ideas, arquitectura y copias de seguridad. |
