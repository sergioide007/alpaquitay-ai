---
title: Comandos del chat
nav: Comandos del chat
description: Referencia de los comandos que entiende el chat del arnés de Alpaquitay AI: onboard, dora, deuda, economía, postmortem, diff, si aplicar, no, promover y si.
---

# Comandos del chat

Además del lenguaje natural, el chat de la pestaña **Work** entiende una serie de comandos cortos. Se escriben **solos**, como mensaje completo (sin nada más en la línea). Casi todos se resuelven en tu equipo sin llamar a ningún modelo, así que son gratis y rápidos.

```video
title: onboard, dora, deuda y economía
src: media/evidence-chat.mp4
poster: media/evidence-chat.jpg
duration: 0:36
caption: Los comandos locales del arnés en un proyecto real: análisis inicial, señales DORA, deuda y economía de la sesión.
```

## Resumen

| Comando | Qué hace | ¿Llama a un modelo? |
|---|---|---|
| `onboard` | Analiza el proyecto, detecta build y test, escribe el ADR-001 y calcula DORA. | No |
| `dora` | Señales DORA a partir de los últimos 40 commits. | No |
| `deuda` | Muestra el medidor de deuda agéntica. | No |
| `economía` (o `economia`) | Operaciones locales frente a llamadas a modelos en la sesión. | No |
| `postmortem <texto>` | Clasifica un fallo que pegas (build, test, lint, escritura…). | No |
| `diff <ruta>` | Muestra completo el diff pendiente de un archivo. | No |
| `si aplicar` | Escribe todos los diffs pendientes con política, revisión y *checkpoint*. | No |
| `no` | Descarta todos los diffs pendientes. | No |
| `promover` | Convierte la última idea de la bandeja en una épica de `spec.md`. | Sí |
| `si` (o `sí`, `dale`, `ok`, `confirmo`) | Confirma la ruta que el arnés propuso. | Depende de la ruta |

> [!NOTE]
> El chat necesita un proveedor activo para aceptar mensajes, incluso para estos comandos locales. Si no hay ninguno, verás *«No hay proveedor AI disponible»*.

## onboard

Ejecutar `onboard` guarda la verificación del contrato; detectar un stack por sí solo no habilita el gate. Para un stack desconocido, confirma los comandos así: `onboard {"build":"comando de build","test":"comando de tests"}`.

El mejor primer paso en cualquier proyecto, sobre todo si es heredado. Hace, en local:

- **Huella del proyecto:** *frameworks*, carpetas de código reales y puntos de entrada. Nunca da por hecho `src/`.
- **Contrato de plataforma:** los comandos de test, build y lint que corresponden a tu *stack* (se guardan en `.alpaquitay/platform.json`). Si no puede confirmarlos te lo dice (*sin verificar — confirma tu comando*).
- **ADR-001:** un primer registro de decisión con el *stack*, las fuentes y la regla del arnés (toda escritura pasa por diff, política y *checkpoint*), en `.alpaquitay/ADR-001-onboard.md`.
- **Nivel DORA** del repositorio.

Además **resta 10 puntos de deuda**. Ejecútalo una vez al empezar y de nuevo si cambias de *stack*.

## dora

Calcula **señales** de entrega a partir de `git log` (los últimos 40 commits), sin telemetría externa:

| Señal | Cómo se calcula |
|---|---|
| Frecuencia | 15 o más commits: «diaria o mejor»; 6 o más: «semanal»; menos: «ocasional». |
| *Lead time* | «Trazable por #SPEC» si hay commits enlazados a tareas. |
| Tasa de fallo | Porcentaje de commits que son *fix*, *hotfix*, *revert*, *rollback* o *bug*. |
| Recuperación | Mediante los *checkpoints* (*stash*) del arnés. |
| Nivel | **High** si al menos el 60 % de los commits están enlazados y la tasa de fallo es ≤ 15 %; **Low** si la tasa supera el 30 %; **Medium** en otro caso. |

> [!IMPORTANT]
> Son **aproximaciones derivadas del repositorio**, no métricas DORA operativas: Git no sabe cuándo despliegas ni cuándo hay un incidente. Alpaquitay las etiqueta así a propósito. Mejora la señal enlazando commits con `#SPEC-xxx` y con menos *hotfix*.

## deuda

Muestra la puntuación (de 0 a 100), una barra y el estado: *sana*, *alta — revisa antes de seguir* (desde 70) o *techo roto — paga deuda antes de Build* (desde 100). Las reglas de puntos están en [Cómo piensa el arnés](../arnes/#la-deuda-agentica).

## economía

Cuenta las operaciones resueltas en local (gratis) frente a las llamadas a modelos. Cada *Build* confirmado cuesta entre 2 y 4 llamadas. Útil cuando pagas por uso a un proveedor en la nube.

## postmortem

Pega el texto de un fallo después de la palabra:

```text
postmortem npm ERR! Test failed. See above for more details.
  ● reservas › no permite reservar una pista ocupada
    expect(received).toBe(expected)
```

Lo clasifica (build, test, lint, diagnósticos, escritura o desconocido), propone la causa probable y el siguiente paso, con el comando de test de tu proyecto. No ejecuta nada. El arnés también genera un *postmortem* automático, sin culpables, cuando una tarea del tablero falla.

## diff, si aplicar y no

Después de que el agente genere cambios, el chat lista los **diffs pendientes**. Nada está escrito todavía.

- `diff src/reservas/calendario.ts` muestra el diff completo de ese archivo.
- `si aplicar` escribe **todos** los pendientes. Antes comprueba el techo de deuda y que la carpeta sea escribible, guarda un *checkpoint* en Git y pasa cada archivo por la política y la revisión automática. Un archivo bloqueado no se escribe; los demás sí.
- `no` los descarta todos.

## promover

Toma la última idea guardada en la bandeja (`.alpaquitay/ideas.json`) y la añade a `spec.md` como épica con tareas. Como escribe `spec.md`, primero comprueba la carpeta y guarda un *checkpoint*.

## si

Cuando el arnés no está seguro, o la ruta es *Deep* (un especialista), te propone la ruta y espera. Responde `si` para seguir con ella; cualquier otra cosa se trata como un mensaje nuevo.
