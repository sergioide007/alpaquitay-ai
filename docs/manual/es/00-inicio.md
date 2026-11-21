---
title: Manual de Alpaquitay AI
nav: Inicio
slug:
description: Manual de uso de Alpaquitay AI para VS Code: instalación, proveedores de IA, especificaciones y tablero, agente de documentos, evidencias, arquitectura, motor local con WebGPU, casos de uso y vídeos.
---

# Manual de Alpaquitay AI

Alpaquitay AI es una extensión gratuita y de código abierto (MIT) para Visual Studio Code. Coloca un **arnés** entre tu intención y tu código: decide la ruta adecuada para cada petición, te enseña cada cambio como un *diff* antes de escribirlo, comprueba las compuertas del ciclo de vida del software y deja un registro local de lo que pasó. Puedes usarla con modelos en tu propio equipo (Ollama, LM Studio o su motor local con WebGPU) o con Anthropic y OpenAI.

Este manual explica cómo usar cada parte, para qué casos sirve y qué garantías da, con capturas y vídeos de la extensión real.

```video
title: Recorrido por el Hub
src: media/tour.mp4
poster: media/tour.jpg
duration: 0:44
caption: Se abre el Hub con `Ctrl+Alt+A` y se recorren sus seis pestañas: Work, Docs, Evidence, Architecture, Agents y Settings.
```

## Por dónde empezar

<ul class="cards">
<li><a href="instalacion/"><strong>1 · Instalar y abrir el Hub</strong><span>Marketplace u Open VSX, los dos atajos y la primera vez.</span></a></li>
<li><a href="proveedores/"><strong>2 · Elegir un proveedor de IA</strong><span>Local y privado (Ollama, LM Studio, motor local) o en la nube.</span></a></li>
<li><a href="work/"><strong>3 · Trabajar con una especificación</strong><span>De <code>spec.md</code> al tablero, y del tablero a un cambio revisado.</span></a></li>
<li><a href="motor-local/"><strong>4 · IA en tu propio equipo</strong><span>Genera especificaciones con WebGPU sin enviar tu texto a ningún servidor.</span></a></li>
<li><a href="casos-de-uso/"><strong>5 · Casos de uso paso a paso</strong><span>Proyecto heredado, proyecto nuevo, libro, arquitectura y más.</span></a></li>
<li><a href="modelos/"><strong>6 · Modelos disponibles</strong><span>Estado en vivo de los modelos firmados del motor local.</span></a></li>
</ul>

## Qué hace Alpaquitay, en una tabla

| Necesitas… | Usa | Capítulo |
|---|---|---|
| Convertir una idea en épicas y tareas | Pestaña **Work** → *Create with AI*, o el comando *Generate Specification (Local Model)* | [Work](work/), [Motor local](motor-local/) |
| Que la IA implemente una tarea sin escribir a ciegas | Arrastrar la tarjeta a **In Progress**, revisar el diff, `si aplicar` | [Work](work/) |
| Saber el estado real del repositorio | `onboard`, `dora`, `deuda` en el chat; pestaña **Evidence** | [Comandos del chat](comandos-chat/), [Evidence](evidence/) |
| Corregir, traducir o revisar un manuscrito | Pestaña **Docs** (Word, Markdown, EPUB, PDF) | [Docs](docs/) |
| Ver y documentar la arquitectura | Pestaña **Architecture**: inferencia, ADR, evaluación, exportar IaC | [Arquitectura](arquitectura/) |
| Una opinión experta (seguridad, QA, DevOps, nube…) | Pregunta en el chat; el arnés elige un especialista | [Agentes](agentes/) |
| Trabajar sin que el código salga de tu equipo | Ollama, LM Studio o el motor local | [Proveedores](proveedores/) |

## Cómo está organizado este manual

- **Capítulos 1 a 3:** instalación, proveedores y cómo piensa el arnés. Léelos en orden la primera vez.
- **Capítulos 4 a 10:** una pestaña o función por capítulo. Puedes saltar al que necesites.
- **Capítulos 11 a 16:** modelos, recetas de uso, diagramas, referencia, solución de problemas y cómo contribuir.

Busca cualquier tema con <kbd>Ctrl</kbd>+<kbd>K</kbd> (o <kbd>/</kbd>). Cada página tiene al final un enlace para proponer mejoras en GitHub: este manual es de la comunidad. También está [en inglés](en/) (botón **EN** arriba).

> [!NOTE]
> El manual describe la versión **3.8.2**. Incluye la pestaña **Changes** para seguir el progreso y revisar los diffs del agente, con acciones para revisar y aplicar o descartar los cambios pendientes. También incluye el proveedor local Qwen 2.5 con WebGPU, *Generate Specification (Local Model)* y la página de modelos.

## Principios que vas a ver en todas partes

1. **Nada se escribe sin que lo veas.** En el Hub, todo cambio de código llega primero como un *diff* acotado y escribir requiere tu `si aplicar`. (La excepción es el comando clásico *Generate from Spec*, que escribe directamente; ver [Work](work/#generate-from-spec-y-validate-against-spec).)
2. **Evidencia antes que autonomía.** Las tareas con código pasan a *Done* solo sin diffs pendientes, con contrato verificado por onboard y build/tests en verde. Los proyectos solo de documentos no necesitan contrato ni esas pruebas, pero sus diffs pendientes también bloquean *Done*.
3. **Privacidad por arquitectura.** No hay servidor intermedio de Alpaquitay. Los modelos locales no salen de tu equipo; las llamadas a la nube van directas a tu proveedor y pasan antes por un límite de privacidad que oculta datos personales y secretos.
4. **Todo queda registrado en tu repositorio**, en la carpeta `.alpaquitay/`: decisiones, deuda, economía de la sesión, memoria del proyecto y ADR.
