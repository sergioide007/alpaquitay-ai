---
title: "Architecture: diagrams, ADRs and IaC"
nav: Architecture · ADRs and IaC
description: How Alpaquitay AI infers your system's architecture from the project, docker-compose and spec.md, shows it on an editable canvas, records ADRs, assesses it with AI and exports it to Terraform, AWS CDK, Azure Bicep or GCP.
---

# Architecture: diagrams, ADRs and IaC

The **Architecture** tab is an architecture canvas that **starts filled in**: Alpaquitay derives the system from what your project already has and from what the spec says will be built. Then you can edit it, ask for changes in plain language, document decisions and export infrastructure as code.

```video
title: Architecture, inferred and exported
src: media/arch-en.mp4
poster: media/arch-en.jpg
duration: 0:24
caption: Re-infer on a project with Express, React, PostgreSQL and Redis in docker-compose, a node's properties and an export to Terraform.
```

## Where the diagram comes from

![Architecture inference: manifests, compose and spec to the canvas and the IaC export](diagrams/08-arch-inference.svg "The evidence the inference uses and what it produces.")

The inference is **deterministic and local** (no model). It reads:

- **Dependencies** in `package.json` (root and sub-packages) and other manifests: `pom.xml`, `requirements.txt`, `go.mod`, `*.csproj`…
- **`docker-compose` services**: names and images (for example `postgres`, `redis`, `rabbitmq`).
- **Folder names** at the first and second level (`api/`, `web/`, `worker/`…).
- **`spec.md`**: what the project *will* build, with its epics as modules.

With that it places at most 14 system nodes and 8 epic modules. Each node remembers its origin: the current workspace, the spec or an epic.

## Working on the canvas

![The Architecture tab with canvas, palette and properties](media/hub-arch.png "The palette on the left, the canvas in the middle, properties and export on the right.")

- **Add nodes** from the palette: *Compute* (Lambda, Container, Service), *Network* (API Gateway, CDN, Client), *Data* (Database, Storage, Queue, Cache) and *Security* (Auth).
- **Connect:** <kbd>Shift</kbd>+click the source node, then <kbd>Shift</kbd>+click the target. **Select:** click (its properties appear on the right). **Move:** drag. **Delete:** select and press <kbd>Delete</kbd>.
- **C4 level:** the *Context*, *Container* and *Component* buttons mark the level you are working at. In this version they do not filter the diagram: every node shows at all three levels. For a C4 diagram by level, ask the architecture specialist in the chat (*"generate a C4 container diagram of this project"*).
- **Save** stores the diagram in `.alpaquitay/arch.json`; **Clear** empties it; **↻ Re-infer** rebuilds it from the project even if one is saved.

## Asking for changes in plain language

Click **▲ AI** to open the *AI Architect* and type, for example:

- *"Design microservices for an e-commerce site"*
- *"Add a Redis cache between the API and the database"*
- *"Convert it to serverless on AWS"*

The architect (the software-architecture specialist) changes the current diagram instead of starting over.

## Assessing and recording decisions

- **▲ Assess** asks for an assessment of the current architecture: quality attributes, risks and recommendations.
- **ADR** opens a form with two fields: the **context** (the current situation) and the **decision** you are considering. *Create ADR* writes the record to `.alpaquitay/adrs/`.

Assess, ADR and AI Architect use the active provider.

## Exporting infrastructure as code

In the right pane, **Export as IaC** generates a starting point from the diagram:

| Button | File |
|---|---|
| Terraform (AWS) | `infra/main.tf` |
| AWS CDK (TS) | `infra/main.ts` |
| Azure Bicep | `infra/main.bicep` |
| GCP YAML | `infra/main.yaml` |

> [!WARNING]
> The export writes `infra/main.<ext>` **directly and overwrites** the file if it exists. It is a skeleton to start from, not production-ready infrastructure: review it, add networking, permissions and secrets, and run it through your pipeline before applying it.

## Architectures it recognises

Alpaquitay detects the project's style and adapts the instructions and the folder structure it proposes:

| Style | Detected by | Structure |
|---|---|---|
| React SPA | `package.json` with react | `src/components`, `pages` |
| Next.js | `package.json` with next | `app/` (App Router) |
| Vue | `package.json` with vue | `src/components`, `views` |
| Angular | `angular.json` | `src/app/` |
| Express API | `package.json` with express | `routes`, `controllers`, `services` |
| Java (Maven or Gradle) | `pom.xml` or `build.gradle` | **Clean Architecture**: `domain`, `application`, `infrastructure`, `shared` |
| C# Web API | `*.csproj` | `Controllers`, `Services`, `Models` |
| Go | `go.mod` | `cmd`, `internal`, `pkg` |
| Django / Flask | `requirements.txt` | `apps/` / `blueprints/` |
| Python package | `pyproject.toml` | package with `__init__.py` |
| React Native | `package.json` with expo | `src/screens`, `components` |

Every Java project follows Clean Architecture with strict dependency inversion: `infrastructure → application → domain`.

![Clean Architecture structures generated for Java Spring and React](diagrams/09-clean-architecture.svg "The two Clean Architecture structures the project builder generates.")
