---
title: Diagramas de arquitectura
nav: Diagramas de arquitectura
description: Galería de los once diagramas de arquitectura de Alpaquitay AI, con lo que muestra cada uno: arnés, extensión, tareas SDD, compuertas SDLC, privacidad, especialistas, arquitectura hexagonal, inferencia, Clean Architecture, agente de documentos y motor local.
---

# Diagramas de arquitectura

Estos son los diagramas oficiales de Alpaquitay AI. Haz clic en cualquiera para verlo a pantalla completa. Están en formato SVG (editables) y PNG en [`docs/diagrams/`](https://github.com/sergioide007/alpaquitay-ai/tree/main/docs/diagrams), generados con los scripts de Python de `docs/diagrams/src/`.

## 1. La tubería del arnés

![Tubería del arnés](diagrams/01-harness-pipeline.svg "Percibir, decidir, carriles Flash, Build y Deep, y la capa de evidencias.")

Cómo recorre una petición el arnés: se percibe el proyecto, se elige un carril, se previsualiza, se protege, se verifica y se registra. Explicado en [Cómo piensa el arnés](../arnes/).

## 2. La extensión por dentro

![Arquitectura de la extensión](diagrams/02-extension-architecture.svg "Raíz de composición, Hub, núcleo del arnés, capas de capacidades y sistemas externos.")

Los componentes del *extension host*: la raíz de composición, el Hub, el núcleo del arnés, las capas de capacidades (proveedores, herramientas, skills, documentos, motor local) y los sistemas externos con los que habla.

## 3. Secuencia de una tarea SDD

![Secuencia de una tarea](diagrams/03-sdd-task-sequence.svg "Planificar, generar, diff, aprobar, aplicar, probar y resultado.")

Lo que pasa entre arrastrar una tarjeta a *In Progress* y que llegue a *Done*. Explicado en [Work](../work/#2-el-tablero).

## 4. Compuertas del SDLC

![Compuertas del SDLC](diagrams/04-sdlc-gates.svg "Seis fases con sus palabras clave, carril y compuerta de salida.")

Las seis fases y lo que exige cada una para avanzar. Explicado en [Cómo piensa el arnés](../arnes/#las-seis-fases-del-sdlc-y-sus-compuertas).

## 5. Proveedores y límite de privacidad

![Proveedores y privacidad](diagrams/05-provider-privacy.svg "Camino local sin cambios; camino a la nube con ocultación de datos y registro sin valores.")

Cómo se elige el proveedor y qué pasa con tu texto en cada camino. Explicado en [Proveedores](../proveedores/#el-limite-de-privacidad).

## 6. Orquestación de especialistas

![Orquestación de especialistas](diagrams/06-domain-orchestration.svg "El agente central, el orquestador y el registro de los 17 especialistas.")

El agente central (privacidad, recuperación de conocimiento, orquestación y refinamiento), el orquestador y el registro de especialistas. Explicado en [Agentes](../agentes/).

## 7. Especialista hexagonal

![Especialista hexagonal](diagrams/07-hexagonal-domain-shell.svg "Puertos primarios, casos de uso, dominio, reglas de control, puertos secundarios y adaptadores.")

La arquitectura de puertos y adaptadores de cada especialista: el dominio nunca depende de la infraestructura.

## 8. Inferencia de arquitectura

![Inferencia de arquitectura](diagrams/08-arch-inference.svg "De manifiestos, compose y spec al lienzo y a la exportación IaC.")

De qué pruebas sale el diagrama de la pestaña Architecture. Explicado en [Arquitectura](../arquitectura/#de-donde-sale-el-diagrama).

## 9. Clean Architecture generada

![Clean Architecture](diagrams/09-clean-architecture.svg "Estructuras de Clean Architecture para Java Spring y React.")

Las estructuras que genera el constructor de proyectos para Java Spring y React.

## 10. Agente de documentos

![Agente de documentos](diagrams/10-docs-agent.svg "Adaptadores, intención, confirmación, edición y análisis, revisión, aplicación y verificación.")

El flujo de la pestaña Docs, de la lectura del formato a la verificación del archivo escrito. Explicado en [Docs](../docs/).

## 11. Motor local

![Motor local](diagrams/11-local-gemma-engine.svg "Host de la extensión, panel del motor con caché, CDN estático y GPU local.")

Cómo se descarga, verifica, guarda y ejecuta el modelo en tu GPU. Explicado en [Motor local](../motor-local/#seguridad-por-que-puedes-fiarte-de-lo-que-se-descarga).
