---
title: "Work: especificación, tablero y chat"
nav: Work · spec, tablero y chat
description: Cómo crear un spec.md con épicas y tareas, moverlo por el tablero Kanban, dejar que la IA implemente una tarea con diffs revisables y enlazar commits con #SPEC.
---

# Work: especificación, tablero y chat

La pestaña **Work** es donde se hace el trabajo de código. Tiene tres paneles: la **especificación** (`spec.md`), el **tablero** Kanban que se deriva de ella y el **chat** con el arnés. Es el flujo SDD (*spec-driven development*) de Alpaquitay: primero se acuerda *qué*, después se implementa *tarea a tarea* y cada cambio queda enlazado a un requisito.

![Pestaña Work con especificación, tablero y chat](media/hub-work.png "Work: especificación a la izquierda, tablero en el centro y chat a la derecha.")

```text
  spec.md ──► Tablero ──► la IA implementa una tarea ──► diff ──► si aplicar ──► spec.md [x] ──► commit #SPEC-001
     ▲                                                                                              │
     └──────────────────────────────────── ciclo de retroalimentación ─────────────────────────────┘
```

## 1. La especificación (`spec.md`)

`spec.md` es Markdown normal en la raíz de tu proyecto, y es **la base de datos del tablero**: el estado de las tarjetas se lee de este archivo, no se guarda aparte. Así que lo puedes editar a mano, revisarlo en un *pull request* y versionarlo como cualquier otro archivo.

```markdown
# Portal de reservas del club

Reservas de pistas con pago online y recordatorios por correo.

## Epic: Reservas
- [ ] SPEC-001 Crear el calendario de pistas disponibles
- [ ] SPEC-002 Permitir reservar una pista para una hora
- [x] SPEC-003 Diseñar el modelo de datos de reservas

## Epic: Pagos
- [ ] SPEC-004 Cobrar la reserva con la pasarela de pago
- [ ] SPEC-005 Enviar el recibo por correo
```

Reglas del formato:

- `# Título` y un párrafo de contexto al principio.
- Cada `## Epic: …` (o cualquier encabezado de nivel 2) agrupa tareas.
- `- [ ] texto` es una tarea pendiente; `- [x] texto` una terminada.
- Los identificadores `SPEC-001`, `SPEC-002`… se asignan por posición.
- El texto libre entre tareas se usa como contexto para la IA.

¿Tu proyecto usa otro nombre, como `tasks.md` o `backlog.md`? Cámbialo en **Settings → Workspace → Spec file** (`alpaquitay-ai.specFile`). Si el archivo no existe, Alpaquitay busca otros parecidos.

### Tres formas de crearla

| Forma | Cuándo | Dónde |
|---|---|---|
| **+ Create with AI** / **Regen** | Tienes un proveedor configurado y quieres que la IA analice el workspace. *Regen* admite una descripción opcional del proyecto. | Panel *Spec* del Hub. |
| **Generate Specification (Local Model)** | Quieres que tu descripción no salga del equipo. Escribe `specs/<nombre>.md` y nunca sobrescribe. | Paleta de comandos o <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>. Ver [Motor local](../motor-local/). |
| **A mano** | Ya sabes lo que quieres. | Cualquier editor. Pulsa ↻ en el panel *Spec* para recargar. |

> [!TIP]
> Una buena especificación tiene tareas pequeñas que empiezan por un verbo y que se pueden verificar: «Validar el correo del formulario de registro» es mejor que «Usuarios». La IA implementa mucho mejor una tarea de un par de archivos que una épica entera.

## 2. El tablero

Todas las tareas pendientes empiezan en **Backlog**. Las columnas son *Backlog*, *Todo*, *In Progress* y *Done*.

```video
title: Una tarea del tablero, de principio a fin
src: media/work-task.mp4
poster: media/work-task.jpg
duration: 0:25
caption: Se arrastra SPEC-003 a In Progress; el agente planifica y genera el archivo, el chat muestra el diff y `si aplicar` lo escribe con checkpoint. Los tests pasan, pero el build falla (el proyecto de ejemplo no tiene `vite` instalado), así que la compuerta DoD deja la tarjeta en In Progress y la deuda sube. Grabado con Ollama (llama3.2 3B), acelerado en las esperas.
```

**Arrastrar una tarjeta a *In Progress* arranca la IA**, y no escribe nada a ciegas:

1. **Plan.** El agente revisa el workspace y decide qué archivos crear o cambiar (como mucho 6). Las rutas que saldrían del proyecto se descartan; una ruta que el modelo escriba como `/api/x.js` se lee como `api/x.js` dentro del proyecto.
2. **Generación.** Genera cada archivo y lo guarda como **diff pendiente**. El chat muestra cada diff (`+añadidas/−quitadas`).
3. **Tu revisión.** Lee los diffs. Usa `diff <ruta>` para ver uno completo.
4. **Aplicar o descartar.** `si aplicar` escribe todos los pendientes con la política, la revisión automática y el *checkpoint* descritos en [Cómo piensa el arnés](../arnes/#que-protege-una-escritura). `no` los descarta todos.
5. **Verificación.** Tras aplicar se ejecutan los comandos reales de build y test.
6. **Done.** La tarjeta pasa a *Done* y `spec.md` se actualiza a `- [x]` **solo si** la compuerta DoD tiene evidencia. Si no, se queda en *In Progress* y el chat explica qué falta.

![Secuencia de una tarea: planificar, generar, diff, aprobar, aplicar, probar](diagrams/03-sdd-task-sequence.svg "Lo que ocurre entre arrastrar la tarjeta y que llegue a Done.")

La pestaña **Evidence** muestra la misma cola de revisión con botones (*Discard all* y *Apply & run gates*), por si prefieres hacer clic en vez de escribir.

> [!IMPORTANT]
> Mientras trabaja una tarea, la IA **no puede escribir `spec.md`**: si lo intenta, esa escritura se ignora. Así un modelo despistado no puede borrar tus casillas. El tablero actualiza `spec.md` por su cuenta cuando la tarea llega a *Done*.

Si la llamada al modelo falla, el error aparece en el chat y la tarjeta vuelve a su columna: no hay fallos silenciosos.

## 3. El chat

El chat del panel derecho entiende tres tipos de mensaje:

- **Lenguaje natural.** El arnés decide el carril (Flash, Build o Deep), te enseña su decisión y, si hace falta, te pide confirmación. Ver [Cómo piensa el arnés](../arnes/#los-tres-carriles).
- **Comandos del arnés**, como `onboard`, `dora`, `deuda` o `si aplicar`. La mayoría no gastan llamadas a modelos. Están todos en [Comandos del chat](../comandos-chat/).
- **Skills**, con el botón **/skill**: crear un archivo, refactorizar, generar tests, el *standup* diario… Ver [Agentes](../agentes/).

## Ideas que todavía no son tareas

Escribe una idea desordenada («se me ocurre que los socios podrían reservar con prioridad…»). El arnés la detecta como carril *Flash · ideate* y la guarda en la **bandeja de ideas** (`.alpaquitay/ideas.json`) con un objetivo, un alcance y un no-alcance propuestos. Cuando la tengas clara, escribe `promover` y la última idea se convierte en una épica nueva de `spec.md`.

## Enlazar commits con tareas

Menciona la tarea en el mensaje del commit:

```text
feat(reservas): calendario de pistas disponibles #SPEC-001

Muestra las franjas libres de los próximos 7 días.
```

Se reconocen `#SPEC-001` y `[SPEC: 001]`. La pestaña **Evidence** marca esos commits en el historial y los cuenta en las señales del repositorio: cuantos más commits enlazados, mejor trazabilidad.

## Generate from Spec y Validate Against Spec

Además del tablero, el menú rápido tiene dos comandos clásicos que trabajan con **cualquier archivo de especificación** (`.md`, `.yaml`, `.yml`, `.json` o `.feature`):

- **Generate from Spec** elige un archivo, planifica los archivos necesarios y los genera.
- **Validate Against Spec** compara el código del proyecto con la especificación y te informa de lo que no cumple.

> [!WARNING]
> *Generate from Spec* **escribe los archivos directamente**, sin diff previo ni `si aplicar`, y puede sobrescribir archivos con el mismo nombre. Úsalo con el árbol de Git limpio para revisar el resultado con `git diff` y deshacerlo si hace falta. Para trabajo con revisión previa, usa el tablero.

**New Specification** crea una plantilla en `specs/`: API REST (OpenAPI 3.0), *feature* BDD (Gherkin), esquema de base de datos, microservicio Spring Boot o componente React.
