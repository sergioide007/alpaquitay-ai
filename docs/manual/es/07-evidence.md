---
title: "Evidence: señales, deuda y revisión"
nav: Evidence · señales y revisión
description: La pestaña Evidence de Alpaquitay AI: señales del repositorio, deuda agéntica, cola de revisión de diffs, compuertas del SDLC, historial Git trazable, rutas de especialistas y estado de privacidad.
---

# Evidence: señales, deuda y revisión

La pestaña **Evidence** es el panel de control de entrega: reúne en una pantalla lo que el arnés sabe de tu proyecto y lo que está pendiente de tu decisión. Su lema resume la idea de Alpaquitay: **evidencia antes que autonomía**.

![Pestaña Evidence con métricas, compuertas, cola de revisión y deuda](media/hub-evidence.png "Evidence: cuatro métricas arriba; compuertas, cola de revisión e historial a la izquierda; deuda, rutas y privacidad a la derecha.")

## Las cuatro métricas

| Tarjeta | Qué muestra |
|---|---|
| **Repository signal** | El nivel DORA aproximado calculado desde Git (*High*, *Medium*, *Low* o *sin datos*). |
| **Agentic debt** | La deuda actual sobre 100. |
| **Review queue** | Cuántos archivos tienen un diff pendiente de tu decisión. |
| **Session economy** | Operaciones locales frente a llamadas a modelos. |

Los botones **Run onboarding** (equivale a `onboard`) y **↻ Refresh evidence** están arriba a la derecha.

## Compuertas ejecutables del SDLC

Las seis fases (Requisitos, Diseño, Build, Test, Deploy, Maintain) con su compuerta y su estado: *routed*, *enforced*, *evidence*, *human gate* o *tracked*. Indican **qué tipo de control aplica el arnés** en cada fase: en Build y Diseño se impone, en Test se exige evidencia real y en Deploy siempre decide una persona. Detalle en [Cómo piensa el arnés](../arnes/#las-seis-fases-del-sdlc-y-sus-compuertas).

## Cola de revisión

Lista cada archivo con un diff pendiente. Dos botones:

- **Discard all** — descarta todos (como `no`).
- **Apply & run gates** — aplica todos con política, revisión automática y *checkpoint*, y ejecuta build y test (como `si aplicar`).

Si la cola está vacía verás *«No pending changes. The harness writes only after review.»*

## Historial Git trazable

Los últimos commits del repositorio, con una marca en los que enlazan una tarea (`#SPEC-001` o `[SPEC: 001]`). El aviso que lo acompaña es intencionado: las cifras DORA son **aproximaciones derivadas del repositorio**; conecta tus eventos reales de despliegue e incidentes antes de tratarlas como mediciones operativas.

## Techo de deuda

Puntuación, estado (*healthy*, alta o techo roto) y los últimos eventos que la movieron. Al llegar a 100 se bloquea el carril Build. Se paga con `onboard`, aplicando diffs y con tareas *Done* verificadas.

## Rutas de especialistas

Recordatorio de los tres carriles:

- **Flash** — recepción local: preguntas, ideas y comandos sin coste.
- **Build** — implementación con diff previo: plan, vista previa, aplicar y verificar.
- **Deep** — un especialista registrado: seguridad, QA, arquitectura, DevOps…

Cada ruta deja un recibo en `.alpaquitay/decisions.jsonl`: **un agente, un recibo**.

## Límite de privacidad

Estado de la privacidad de la sesión:

| Línea | Valor habitual |
|---|---|
| Telemetry | *Off by default* |
| Cloud redaction | *Boundary ready*, o el número de sustituciones hechas en la última petición a la nube |
| Keys | VS Code SecretStorage |
| Intermediary servers | *None* |

La franja del arnés (bajo las pestañas) muestra el mismo estado en corto: `privacy local-first` cuando el proveedor activo es local.
