---
title: "Docs: documentos con un agente"
nav: Docs · documentos con un agente
description: Cómo corregir, mejorar, traducir, resumir y revisar la coherencia de documentos Word, Markdown, EPUB y PDF con el agente de la pestaña Docs, revisando cada cambio antes de aplicarlo.
---

# Docs: documentos con un agente

La pestaña **Docs** es para todo lo que no es código: manuscritos, informes, artículos, documentación y libros. Le hablas al agente en español o en inglés, como a un editor:

> *«corrige la ortografía del capítulo 3»* · *«hazlo más directo, mantén mi voz»* · *«translate the book to English»* · *«revisa la coherencia entre capítulos»* · *«¿qué le falta a este capítulo?»*

```video
title: Un informe editorial de un documento
src: media/docs-agent.mp4
poster: media/docs-agent.jpg
duration: 1:03
caption: Se abre un Markdown del proyecto, se pide *Editorial feedback* y el agente devuelve fortalezas, problemas y sugerencias concretas, que se guardan como .md. No modifica el documento. Grabado con Ollama (llama3.2 3B) y acelerado en la espera.
```

## Formatos

| Formato | Leer | Escribir | Notas |
|---|---|---|---|
| `.docx` (Word) | ✅ | ✅ | Los cambios se escriben como **control de cambios** de Word (Revisar → Aceptar/Rechazar). Los párrafos que no se tocan quedan idénticos byte a byte. |
| `.md` / `.txt` | ✅ | ✅ | Sin pérdidas fuera de los bloques editados; bloques de código, tablas y *front matter* protegidos. |
| `.epub` | ✅ | ✅ | Los capítulos siguen el orden del libro; las cursivas y negritas sobreviven. |
| `.pdf` | ✅ | ➡️ `.md` | Solo lectura, en la medida de lo posible (PDF con texto). Un PDF escaneado necesita OCR antes. |

Desde la misma pestaña puedes **convertir** cualquier documento a **Markdown**, **Word** o **EPUB**: un manuscrito en Markdown se convierte en un EPUB publicable con un clic.

## Paso a paso

![Pestaña Docs con un documento abierto y las acciones del agente](media/hub-docs.png "La pestaña Docs: documento abierto, acciones rápidas y conversación con el agente.")

1. **Abre un documento** con *Open file…* o elígelo en la lista *Documents in this workspace…*.
2. **Elige una acción** o escribe tu propia instrucción:
   - **Editar:** *Proofread* (ortografía y gramática), *Improve style*, *Shorten*, *Translate to* (inglés, español, francés, alemán, italiano o portugués).
   - **Analizar:** *Summarize*, *Outline*, *Consistency check* (nombres, fechas, lugares y terminología entre capítulos) y *Editorial feedback*.
3. **Revisa la propuesta.** Cada párrafo cambiado se muestra con un **diff palabra a palabra**. Los cambios grandes, los que alteran números y los que cambian mucho la longitud se marcan como *review* y **no vienen preseleccionados**.
4. **Selecciona** con *Select all*, *Only safe* o *None*, o casilla a casilla.
5. **Pulsa *Apply selected*.** Por defecto se escribe **un archivo nuevo** (`nombre.edited.docx`, `nombre.edited.md`…). Si decides sobrescribir, antes se guarda una copia en `.alpaquitay/backups/`.
6. **Verificación.** El archivo escrito se vuelve a leer para comprobar que se puede abrir y que contiene cada cambio aceptado.

Los análisis (resumen, esquema, coherencia, comentarios) no modifican el documento: los puedes guardar con *Save report as .md*.

![Flujo del agente de documentos](diagrams/10-docs-agent.svg "Adaptadores por formato, intención, confirmación, ejecución, revisión, aplicación y verificación.")

## Las mismas garantías que en el código

- El agente solo **propone**; tú decides qué se aplica.
- **Bloques protegidos que nunca toca:** enlaces, notas al pie, campos, imágenes, tablas y código.
- **Libros enteros:** si una operación necesita más de 20 llamadas al modelo te pide confirmación (*Continue*), y nunca hace más de 60.
- **Privacidad:** con un proveedor en la nube el texto pasa por el límite de privacidad (datos personales y secretos ocultados); con un modelo local el manuscrito no sale de tu equipo.
- **Sin dependencias externas:** los lectores y escritores de ZIP, DOCX, EPUB y PDF están integrados en la extensión, así que es pequeña y auditable.

## Límites, dichos claramente

- En un párrafo de Word que el agente reescribe, el formato interno del párrafo (por ejemplo, una palabra en negrita) se sustituye por el formato de su primer fragmento. El control de cambios muestra exactamente qué cambió.
- Los párrafos con hipervínculos, campos o notas se **saltan** en lugar de arriesgarse a dañarlos.
- La calidad depende del modelo. En nuestras pruebas, un modelo local de 3B (`llama3.2:3b`) hizo un informe editorial útil, pero respondió *«No changes needed»* al pedirle corregir un texto en español sin tildes. Para corregir, editar estilo o traducir, usa un modelo de 7B o más, o uno en la nube.

> [!TIP]
> Para un libro, empieza por **Consistency check** y **Outline**: no cambian nada y te dan una visión del conjunto. Después corrige capítulo a capítulo con *Proofread* y revisa con calma los cambios marcados como *review*.
