---
title: Contributing and community
nav: Contributing and community
description: How to contribute to Alpaquitay AI and to this manual, how to build the extension from source, and where to find the community and the author.
---

# Contributing and community

Alpaquitay AI is free software (MIT) made for the community. Every bit of help counts: a fix to this manual, a new use case, a well-described bug or a code improvement.

## Improving this manual

Every page ends with a **Suggest an improvement to this page** link that opens the Markdown file on GitHub for editing.

- The chapters are in [`docs/manual/en/`](https://github.com/sergioide007/alpaquitay-ai/tree/main/docs/manual/en) and the Spanish originals in [`docs/manual/es/`](https://github.com/sergioide007/alpaquitay-ai/tree/main/docs/manual/es), one file per chapter with the same number. If you change a chapter, change its translation too: the build fails when the two languages do not have the same chapters.
- Screenshots and videos are in `manual/media/`.
- The site is built with `npm run manual:build`, which **fails on a broken link, a missing anchor or a missing image**. `npm run manual:check` checks that the published copy is up to date.

Style rules: short sentences, second person (*you*), one step per line in procedures, and nothing the extension does not really do. If you describe a feature, check it in the code or in the extension first.

## Building the extension

```bash
git clone https://github.com/sergioide007/alpaquitay-ai.git
cd alpaquitay-ai
npm ci
npm run compile && npm run lint && npm test
```

Press <kbd>F5</kbd> in VS Code to open a development window with the extension loaded from source. The contribution rules are in [CONTRIBUTING.md](https://github.com/sergioide007/alpaquitay-ai/blob/main/CONTRIBUTING.md).

## Community and contact

| Channel | Use it for |
|---|---|
| [GitHub Issues](https://github.com/sergioide007/alpaquitay-ai/issues) | Bugs and feature requests. |
| [LinkedIn](https://www.linkedin.com/in/sergioide007/) | Professional contact and project news. |
| [Medium](https://medium.com/@sergioide007) | Articles on SpecSolid and agentic software engineering. |
| [YouTube: @codigosinteticolibro](https://www.youtube.com/@codigosinteticolibro) | Videos about the book *Código Sintético* (in Spanish). |
| Email: [sergio@specsolid.com](mailto:sergio@specsolid.com) | Collaborations, privacy and vulnerabilities (privately). |

## The ideas behind Alpaquitay

The harness applies the ideas of the book [*Synthetic Code*](https://info-codigo-sintetico.specsolid.com/en/) by Sergio Perez Ruiz (in Spanish, **[Código Sintético](https://codigosintetico.specsolid.com)**), together with principles from Robert C. Martin and Martin Fowler: small, safe steps, reversible decisions and evidence before autonomy.

If Alpaquitay is useful to you, a ⭐ on [GitHub](https://github.com/sergioide007/alpaquitay-ai) helps others find it.
