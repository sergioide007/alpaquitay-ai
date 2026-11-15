---
title: Contribuir y comunidad
nav: Contribuir y comunidad
description: Cómo contribuir a Alpaquitay AI y a este manual, cómo compilar la extensión desde el código fuente y dónde encontrar a la comunidad y al autor.
---

# Contribuir y comunidad

Alpaquitay AI es software libre (MIT) hecho para la comunidad. Toda ayuda cuenta: una corrección de este manual, un caso de uso nuevo, un fallo bien descrito o una mejora de código.

## Mejorar este manual

Cada página tiene al final el enlace **Proponer una mejora a esta página**, que abre el archivo Markdown en GitHub para editarlo.

- Los capítulos están en [`docs/manual/es/`](https://github.com/sergioide007/alpaquitay-ai/tree/main/docs/manual/es) y su traducción al inglés en [`docs/manual/en/`](https://github.com/sergioide007/alpaquitay-ai/tree/main/docs/manual/en), uno por archivo con el mismo número. Si cambias un capítulo, cambia también su traducción: la generación falla si los dos idiomas no tienen los mismos capítulos.
- Las capturas y vídeos están en `manual/media/`.
- La web se genera con `npm run manual:build`, que **falla si hay un enlace roto, un ancla que no existe o una imagen que falta**. `npm run manual:check` comprueba que lo publicado está al día.

Reglas de estilo: frases cortas, segunda persona (*tú*), un paso por línea en los procedimientos y nada que la extensión no haga de verdad. Si describes una función, compruébala en el código o en la extensión antes.

## Compilar la extensión

```bash
git clone https://github.com/sergioide007/alpaquitay-ai.git
cd alpaquitay-ai
npm ci
npm run compile && npm run lint && npm test
```

Pulsa <kbd>F5</kbd> en VS Code para abrir una ventana de desarrollo con la extensión cargada desde el código. Las normas de contribución están en [CONTRIBUTING.md](https://github.com/sergioide007/alpaquitay-ai/blob/main/CONTRIBUTING.md).

## Comunidad y contacto

| Canal | Para qué |
|---|---|
| [GitHub Issues](https://github.com/sergioide007/alpaquitay-ai/issues) | Fallos y propuestas de funciones. |
| [LinkedIn](https://www.linkedin.com/in/sergioide007/) | Contacto profesional y novedades del proyecto. |
| [Medium](https://medium.com/@sergioide007) | Artículos sobre SpecSolid e ingeniería de software con agentes. |
| [YouTube: @codigosinteticolibro](https://www.youtube.com/@codigosinteticolibro) | Vídeos sobre el libro *Código Sintético*. |
| Correo: [sergio@specsolid.com](mailto:sergio@specsolid.com) | Colaboraciones, privacidad y vulnerabilidades (en privado). |

## Las ideas detrás de Alpaquitay

El arnés aplica las ideas del libro **[Código Sintético](https://codigosintetico.specsolid.com)** de Sergio Perez Ruiz (en inglés, [*Synthetic Code*](https://info-codigo-sintetico.specsolid.com/en/)), junto con principios de Robert C. Martin y Martin Fowler: pasos pequeños y seguros, decisiones reversibles y evidencia antes de autonomía.

Si Alpaquitay te resulta útil, una ⭐ en [GitHub](https://github.com/sergioide007/alpaquitay-ai) ayuda a que otras personas lo encuentren.
