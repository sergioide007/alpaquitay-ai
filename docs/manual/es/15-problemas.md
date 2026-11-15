---
title: Solución de problemas y preguntas frecuentes
nav: Problemas y preguntas
description: Soluciones a los problemas más comunes de Alpaquitay AI (sin proveedor, Ollama no detectado, tareas que no llegan a Done, deuda bloqueada, motor local sin WebGPU) y respuestas a las preguntas frecuentes.
---

# Solución de problemas y preguntas frecuentes

## Problemas comunes

### «No hay proveedor AI disponible»

No hay ningún proveedor activo. Comprueba, en este orden:

1. ¿Está Ollama en marcha? Abre `http://localhost:11434` en el navegador: debe responder *Ollama is running*. ¿Tiene algún modelo? `ollama list`.
2. ¿LM Studio tiene un modelo cargado **y** el servidor arrancado?
3. ¿Guardaste una clave con **Configure AI Provider**?
4. ¿`preferredProvider` apunta a uno que no está disponible? Ponlo en `auto`.

Después de arrancar Ollama, elige el modelo en el selector de la cabecera del Hub o recarga la ventana (*Developer: Reload Window*).

### Las respuestas de Ollama tardan mucho o se cortan

Sube `alpaquitay-ai.requestTimeout` (por ejemplo a `300000`) y, en **Settings → Ollama**, *Max output tokens*. Con equipos sin GPU dedicada, usa un modelo más pequeño.

### La tarea no pasa a *Done*

Es la compuerta DoD haciendo su trabajo. El chat dice qué la bloquea:

- *«N diff(s) sin aplicar»* → responde `si aplicar` o `no`.
- *«contrato platform sin verificar — corre `onboard` primero»* → ejecuta `onboard` y confirma el comando de test si te lo pide.
- Falló el build o los tests → lee el *postmortem* del chat, corrige y vuelve a intentarlo.

### *«Build bloqueado por techo de deuda»*

La deuda llegó a 100. Págala: `onboard` (−10), aplica o descarta los diffs pendientes y cierra tareas con evidencia (−8 cada una). Consulta el estado con `deuda`. [Detalle](../arnes/#la-deuda-agentica)

### *«Bloqueado: protegido … (secretos)»* o *«fuera de fuentes evidenciadas»*

La política o la revisión automática pararon un archivo:

- Los archivos de secretos (`.env`, `*.pem`, `*.key`…) nunca se escriben desde el arnés. Edítalos tú.
- *Fuera de fuentes evidenciadas* significa que el archivo está fuera de las carpetas de código detectadas. Si la carpeta es correcta, vuelve a ejecutar `onboard` para actualizar la huella del proyecto.

### Quiero deshacer un `si aplicar`

Antes de escribir se guardó un *checkpoint*: `git stash list` muestra uno llamado `alpaquitay/apply-diffs-<fecha>`. Descarta los cambios no deseados con Git (por ejemplo `git restore <archivo>`) o recupera el estado del *checkpoint* con `git stash apply stash@{N}`.

### El tablero no muestra mis tareas

- ¿Tu especificación se llama `spec.md` y está en la raíz? Si no, cambia `alpaquitay-ai.specFile`.
- ¿Las tareas tienen el formato `- [ ] texto` bajo un encabezado `##`? [Formato](../work/#1-la-especificacion-spec-md)
- Pulsa ↻ en el panel *Spec* para recargar.

### El motor local no funciona

La tabla completa de mensajes y soluciones está en [Motor local → Si algo falla](../motor-local/#si-algo-falla). Las dos causas más frecuentes:

1. **El diálogo de confirmación está esperando tu clic** fuera de la vista. Búscalo en la barra de tareas.
2. **VS Code está renderizando por software** tras un fallo de su proceso de GPU. Cierra todas sus ventanas y ábrelo de nuevo; compruébalo con:

```bash
code --status
```

En *GPU Status* debe aparecer `webgpu: enabled`.

### Ctrl+Shift+A abre otra cosa

Ese atajo es también el de GitHub Copilot. Alpaquitay lo usa para su menú rápido, que incluye una entrada para abrir Copilot Chat. Si prefieres otro atajo, cámbialo en *File → Preferences → Keyboard Shortcuts* buscando `alpaquitay-ai.showMenu`.

## Preguntas frecuentes

**¿Alpaquitay envía mi código a algún servidor de Alpaquitay?**
No. No hay servidor intermedio. Con un proveedor local, tu código no sale del equipo; con uno en la nube, va directo a ese proveedor después del límite de privacidad. El único servidor del proyecto es el CDN estático de modelos, que solo sirve archivos firmados y nunca recibe tus textos.

**¿Es gratis?**
Sí, la extensión es gratuita y de código abierto (MIT). Pagas solo lo que uses de un proveedor en la nube, si eliges uno.

**¿Necesito una GPU?**
No para usar Alpaquitay con Ollama, LM Studio o la nube. Sí para el motor local (WebGPU).

**¿Puedo usarlo en un proyecto de empresa?**
Sí. Para código confidencial, usa solo proveedores locales y revisa la receta [Trabajar sin que el código salga de tu equipo](../casos-de-uso/#3-trabajar-sin-que-el-codigo-salga-de-tu-equipo).

**¿Por qué me pregunta tanto antes de actuar?**
Es deliberado: *ask-before-act* es uno de sus cinco principios. Las respuestas cortas (`si`, `si aplicar`, `no`) hacen que la confirmación cueste un segundo.

**¿Las métricas DORA son reales?**
Son señales derivadas de Git y están etiquetadas así. Para métricas operativas necesitas tus datos de despliegue e incidentes.

**¿Funciona con GitHub Copilot instalado?**
Sí, conviven. El menú rápido de Alpaquitay incluye un acceso a Copilot Chat.

**¿Dónde informo de un fallo?**
En [GitHub Issues](https://github.com/sergioide007/alpaquitay-ai/issues). Si es una vulnerabilidad, por correo privado, nunca en un *issue* público ([SECURITY.md](https://github.com/sergioide007/alpaquitay-ai/blob/main/SECURITY.md)).
