---
title: Casos de uso paso a paso
nav: Casos de uso
description: Recetas concretas para usar Alpaquitay AI: entender un proyecto heredado, arrancar uno nuevo desde una idea, trabajar sin que el código salga del equipo, escribir un libro, documentar una decisión de arquitectura, revisar la seguridad y seguir la entrega de un equipo.
---

# Casos de uso paso a paso

Cada receta indica para quién es, qué necesitas y los pasos, con enlaces al capítulo que explica cada pieza.

## 1. Entender un proyecto heredado sin documentación

**Para:** quien hereda un repositorio y necesita orientarse antes de tocar nada.
**Necesitas:** el repositorio con su historial de Git y cualquier proveedor.

1. Abre la carpeta y el Hub (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd>).
2. Escribe `onboard`. Obtienes el *stack*, las carpetas de código reales, los comandos de test y build y un ADR-001 en `.alpaquitay/`. [Comandos del chat](../comandos-chat/#onboard)
3. Escribe `dora` para ver cómo se ha entregado hasta ahora: frecuencia, proporción de arreglos y trazabilidad. [Comandos del chat](../comandos-chat/#dora)
4. Abre **Architecture** y pulsa **↻ Re-infer**: verás los servicios, bases de datos y colas que el proyecto usa de verdad. [Arquitectura](../arquitectura/)
5. Pregunta en el chat: *«explica cómo fluye una petición de reserva por este proyecto»*.
6. Escribe una especificación con lo que vas a cambiar y empieza por la tarea más pequeña. La primera `si aplicar` te enseñará el ciclo completo con *checkpoint*.

**Resultado:** un mapa del sistema, un ADR inicial y una deuda que empieza ya pagada (`onboard` resta 10 puntos).

## 2. Arrancar un proyecto nuevo desde una idea

**Para:** quien tiene una idea y una carpeta vacía.

1. Escribe la idea tal cual la tienes en el chat: *«se me ocurre una app para reservar pistas de pádel con pago y recordatorios»*. Va a la bandeja de ideas con objetivo, alcance y no-alcance propuestos. [Work](../work/#ideas-que-todavia-no-son-tareas)
2. Cuando la tengas clara, escribe `promover` para convertirla en una épica de `spec.md`.
3. ¿Quieres un primer borrador completo sin que tu idea salga del equipo? Usa **Generate Specification (Local Model)**. [Motor local](../motor-local/)
4. Ordena y afina las tareas a mano. Pequeñas, verificables, empezando por un verbo.
5. Si quieres la estructura de carpetas hecha, usa la skill **Project Builder** con el *stack* que prefieras. [Agentes](../agentes/)
6. Ejecuta `onboard` en cuanto haya un `package.json`, `pom.xml` o similar, para que el arnés conozca tus comandos de build y test.
7. Trabaja tarea a tarea desde el tablero.

## 3. Trabajar sin que el código salga de tu equipo

**Para:** equipos con código confidencial, datos personales o requisitos de cumplimiento.

1. Instala **Ollama** y descarga un modelo de código de 7B o más si tu equipo lo soporta. [Proveedores](../proveedores/#ollama)
2. Pon `alpaquitay-ai.preferredProvider: "ollama"` para que nunca se elija un proveedor en la nube por accidente, y **no guardes** claves de Anthropic ni OpenAI.
3. Usa el **motor local** para especificaciones: la única red que usa es la descarga firmada del modelo, una vez.
4. Comprueba en **Evidence → Privacy boundary** que la franja dice `privacy local-first`.
5. Para una red sin Internet, sirve los modelos desde tu propio CDN con tu clave (`cdnBaseUrl` + `extraTrustedKeys`). [Modelos](../modelos/#publicar-un-modelo-en-tu-propio-cdn)

> [!TIP]
> La telemetría ya viene desactivada. Con un proveedor local, Alpaquitay no hace ninguna petición de red con tu código.

## 4. Escribir, corregir y publicar un libro

**Para:** autores y equipos de documentación.

1. Escribe el manuscrito en Markdown (un archivo por capítulo o uno solo) o en Word.
2. En **Docs**, abre el documento y ejecuta **Consistency check**: nombres, fechas, lugares y terminología que no cuadran entre capítulos. [Docs](../docs/)
3. Ejecuta **Outline** y **Editorial feedback** para ver la estructura y lo que falta.
4. Corrige capítulo a capítulo con **Proofread**. Aplica primero *Only safe* y revisa a mano los marcados como *review*.
5. ¿Una edición en otro idioma? **Translate to** genera un archivo nuevo, sin tocar el original.
6. Convierte el Markdown final a **EPUB** con un clic. En Word, los cambios llegan como control de cambios para que tu editor los acepte o rechace.

## 5. Tomar y documentar una decisión de arquitectura

**Para:** arquitectos y líderes técnicos.

1. En **Architecture**, pulsa **↻ Re-infer** para partir del sistema real.
2. Con **▲ AI**, pide la alternativa: *«extrae el módulo de pagos a un servicio aparte con una cola entre ambos»*.
3. Pulsa **▲ Assess** para comparar atributos de calidad y riesgos.
4. Pulsa **ADR**, describe el contexto y la decisión y crea el registro en `.alpaquitay/adrs/`.
5. Pide en el chat *«genera un diagrama C4 de contenedores de este sistema»* para preparar la explicación a cada audiencia.
6. Exporta un esqueleto de **Terraform**, CDK, Bicep o GCP como punto de partida para el equipo de plataforma. [Arquitectura](../arquitectura/#exportar-a-infraestructura-como-codigo)

## 6. Revisar la seguridad antes de una entrega

**Para:** equipos que publican software y quieren una revisión estructurada.

1. Pide en el chat *«haz un modelo de amenazas STRIDE del flujo de pagos»* y confirma con `si`: lo atiende el especialista DevSecOps. [Agentes](../agentes/#especialistas-de-dominio)
2. Pide *«genera un SBOM de este proyecto»* y *«evalúa nuestro pipeline frente a OWASP SAMM»*.
3. Revisa los diffs pendientes en **Evidence**: la revisión automática bloquea secretos literales y archivos fuera de las fuentes. [Cómo piensa el arnés](../arnes/#que-protege-una-escritura)
4. Comprueba que las tareas de la entrega están en *Done* con la compuerta DoD superada, no solo marcadas.

## 7. Seguir la entrega de un equipo

**Para:** líderes técnicos y responsables de ingeniería.

1. Pide al equipo que enlace sus commits con `#SPEC-xxx`. [Work](../work/#enlazar-commits-con-tareas)
2. Mira **Evidence**: señal del repositorio, deuda y cola de revisión. [Evidence](../evidence/)
3. Versiona `.alpaquitay/decisions.jsonl` y `debt.json` para tener un historial auditable de qué decidió el arnés y por qué.
4. Si la deuda pasa de 70, para y paga: aplica o descarta diffs, cierra tareas con evidencia y vuelve a ejecutar `onboard` si cambió el *stack*.

> [!NOTE]
> Las cifras DORA de Alpaquitay salen de Git y están etiquetadas como **señales**, no como métricas operativas. Para decisiones de gestión, combínalas con tus datos reales de despliegue e incidentes.
