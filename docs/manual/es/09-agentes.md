---
title: "Agents: skills y especialistas"
nav: Agents · skills y especialistas
description: Las skills incluidas en Alpaquitay AI, cómo crear las tuyas y cómo el arnés enruta preguntas expertas a 17 especialistas de dominio (seguridad, DevOps, arquitectura, QA, nube, IA y más).
---

# Agents: skills y especialistas

Alpaquitay tiene dos tipos de agentes: **skills**, tareas concretas que lanzas tú, y **especialistas de dominio**, a los que el arnés envía las preguntas expertas.

![Pestaña Agents con la lista de skills](media/hub-agents.png "La pestaña Agents: skills disponibles y el botón para crear una nueva.")

## Skills incluidas

Lánzalas desde el chat de **Work** con el botón **/skill**, o desde la pestaña **Agents**.

| Skill | Qué hace |
|---|---|
| **Create File** | Genera un archivo nuevo a partir de una descripción. |
| **Refactor Code** | Aplica principios SOLID y código limpio al archivo activo. |
| **Generate Tests** | Escribe tests unitarios para el archivo activo. |
| **Generate from Spec** | Lee una especificación, planifica los archivos y los genera todos. |
| **Validate vs Spec** | Comprueba que la implementación cumple la especificación. |
| **New Specification** | Crea un `spec.md` nuevo a partir de una plantilla. |
| **Project Builder** | Construye un proyecto completo a partir de una descripción del objetivo, con la arquitectura del *stack* elegido. |
| **Daily Standup** | Resume el trabajo reciente a partir de los commits. |

## Crear tus propias skills

En **Agents → + New Skill** escribe un nombre, una descripción y el *prompt*. La skill aparece en la lista y en **/skill**.

> [!WARNING]
> En esta versión, las skills creadas desde la pestaña Agents **solo viven mientras VS Code está abierto**: no se guardan en disco y desaparecen al recargar la ventana. Además envían su *prompt* tal cual, sin añadir el texto que escribas en el chat. Guarda tus *prompts* en un archivo del proyecto si quieres reutilizarlos.

Si programas en TypeScript, puedes añadir skills permanentes a la extensión (con acceso al modelo y a las herramientas de archivos y Git) y skills de varios pasos. El README explica cómo: [Custom Skills](https://github.com/sergioide007/alpaquitay-ai#custom-skills-typescript).

## Especialistas de dominio

Cuando haces una pregunta experta en el chat, el arnés la envía al carril **Deep**: elige **un único especialista** registrado, te propone la ruta con su confianza y, cuando confirmas con `si`, hace **una sola llamada** a ese especialista. Antes, el texto pasa por el detector de datos personales; y el resultado pasa por las **reglas de control** (*guardrails*) de ese dominio.

![Orquestación de especialistas de dominio](diagrams/06-domain-orchestration.svg "El agente central, el orquestador y el registro de especialistas.")

Algunas peticiones y el especialista que las atiende:

| Pides… | Especialista |
|---|---|
| Un modelo de amenazas STRIDE, un pipeline CI/CD seguro, un SBOM, una evaluación OWASP SAMM | DevSecOps |
| Planificar un *pentest*, responder a un incidente, un registro de riesgos, una evaluación NIST CSF | Seguridad |
| Métricas DORA, infraestructura como código, un *runbook*, un plan de despliegue, un pipeline CI/CD | DevOps |
| Un ADR, un diagrama C4, un *radar* tecnológico | Arquitectura de software |
| Análisis de deuda técnica, de SOLID o de complejidad | Ingeniería de software |
| Un plan de pruebas, cobertura, una compuerta de calidad | QA |
| Arquitectura RAG, *prompt engineering*, MLOps | Experto en IA |
| Revisión FinOps, excelencia operativa, *Well-Architected* de AWS, Azure o GCP | Well-Architected |
| Microsegmentación, madurez *zero trust* de CISA, accesos privilegiados, identidad | Zero Trust |
| Inventario criptográfico (CBOM), migración poscuántica, agilidad criptográfica, amenaza *harvest-now-decrypt-later* | Preparación cuántica |

En total hay **17 especialistas** registrados, cada uno anclado a sus normas de referencia:

| Especialista | Normas y marcos |
|---|---|
| Inglés (aprendizaje) | CEFR · ISO 17024 · ISO 21001 |
| Ingeniería de software | ISO/IEC 25010 · 12207 · SOLID |
| Arquitectura de software | ISO/IEC 42010 · TOGAF · C4 |
| Desarrollo | ISO/IEC 12207 · Clean Code |
| QA | ISO/IEC 29119 · IEEE 829 |
| DevOps | DORA · ISO/IEC 27001 |
| DevSecOps | OWASP SAMM · ISO/IEC 27001 |
| Seguridad | NIST CSF · ISO/IEC 27001/27005 |
| Infraestructura | ISO/IEC 27001 · ITIL v4 |
| Nube (AWS/Azure/GCP) | AWS WAF · ISO/IEC 27017 |
| Marketing | ISO 9001 · IAB |
| Procesos | ISO 9001 · BPM CBOK · Six Sigma |
| Experto en IA | ISO/IEC 42001 · EU AI Act · NIST AI RMF |
| Negocio | ISO 56002 · OKR · Business Model Canvas |
| Preparación cuántica | inventario criptográfico, PQC |
| Well-Architected | pilares *Well-Architected* |
| Zero Trust | modelo de madurez *zero trust* |

> [!TIP]
> Sé concreto: «haz un modelo de amenazas STRIDE del endpoint de pagos de este proyecto» llega al especialista correcto y con contexto útil. Una pregunta vaga se queda en Flash o te pide aclaración.

Cada especialista sigue una arquitectura hexagonal (puertos y adaptadores), con un modelo de dominio puro y sus reglas de control:

![Especialista con arquitectura hexagonal](diagrams/07-hexagonal-domain-shell.svg "Puertos primarios, casos de uso, dominio, reglas de control, puertos secundarios y adaptadores.")
