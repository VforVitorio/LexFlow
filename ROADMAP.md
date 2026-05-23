# Roadmap de LexFlow

Este documento describe las fases de desarrollo de LexFlow. Para el plan detallado de las fases en curso y futuras, ver [`docs/planning/ROADMAP-v2.md`](docs/planning/ROADMAP-v2.md).

Actualizado: 2026-05-23.

---

## Estado consolidado

| Fase | Título | Estado |
|------|--------|--------|
| 0 | Fundación (repo, CI/CD, branch protection, dependabot) | Hecho |
| 1 | API base + parser legalize-es + búsqueda full-text | Hecho |
| 2 | Grafo de conocimiento (NetworkX, PageRank, MCP tools) | Backend hecho — frontend pendiente |
| 3 | Chatbot (Ollama, LM Studio, OpenAI, Anthropic, Google + FastMCP) | Backend hecho — endpoint SSE + persistencia pendientes |
| 4 | Dashboards Plotly (compliance + analytics) | Backend hecho |
| 5 | Frontend React (scaffold + wiring + features) | Scaffold listo, wiring en curso |
| 6 | Empaquetado y distribución como app de escritorio | Docker listo, instaladores pendientes — ver [`docs/planning/DISTRIBUTION.md`](docs/planning/DISTRIBUTION.md) |
| 7 | Búsqueda semántica y RAG | Planificado |
| **8** | **UX & Onboarding** (greeting, tour, wizard de modelos, accesibilidad guiada) | Planificado — ver [`docs/planning/UX-ONBOARDING.md`](docs/planning/UX-ONBOARDING.md) |
| **9** | **Personalización & MCP extensibility** (templates de usuario, MCP servers externos, `.mcpb` bundles) | Planificado — ver [`docs/planning/MCP-INTEGRATION.md`](docs/planning/MCP-INTEGRATION.md) |

---

## Planes detallados por área

| Documento | Cubre |
|-----------|-------|
| [`docs/planning/ROADMAP-v2.md`](docs/planning/ROADMAP-v2.md) | Roadmap completo con sub-epics, criterios de "hecho", y dependencias |
| [`docs/planning/UX-ONBOARDING.md`](docs/planning/UX-ONBOARDING.md) | Greeting flow sin cuenta, tutorial sombreado (Reactour v3), wizard de modelos, guided actions |
| [`docs/planning/MODELS.md`](docs/planning/MODELS.md) | Recomendación de modelos por hardware tier — local (Ollama Llama 3.2 / Qwen 2.5) y cloud (Claude / GPT / Gemini) |
| [`docs/planning/MCP-INTEGRATION.md`](docs/planning/MCP-INTEGRATION.md) | Cómo LexFlow consume MCP servers externos (`fetch`, `filesystem`, `mcp-pandoc`, `boe-mcp`) y acepta `.mcpb` bundles |
| [`docs/planning/DISTRIBUTION.md`](docs/planning/DISTRIBUTION.md) | Decisión Tauri 2 + PyInstaller sidecar, code signing, auto-update |
| [`docs/planning/INSTALL.md`](docs/planning/INSTALL.md) | Guía de instalación para usuario final + para devs |
| [`docs/planning/ACCESSIBILITY.md`](docs/planning/ACCESSIBILITY.md) | Principios, checklist WCAG 2.1 AA, auditoría axe-core en CI |

---

## Principios de producto (no negociables)

1. **Cero cuentas.** No hay registro, no hay login, no hay PII al servidor. El único dato personal es el nombre de pila opcional que se pregunta al primer arranque y se guarda en `localStorage`.
2. **Doble distribución.** Instalador (`.exe`/`.dmg`/`.AppImage`) para usuarios; `uv run python main.py` para devs. Mismo binario por SO.
3. **Guía siempre que sea manual.** Si algo no se automatiza con un botón, se acompaña con un wizard, dialog o tutorial sombreado. Nunca "edita este JSON".

---

## Futuro abierto

Ideas que podrían explorarse en fases posteriores:

- **Base de datos de grafos** (Neo4j) para reemplazar NetworkX a escala
- **Notificaciones push** de cambios legislativos
- **API pública** para que terceros integren datos legales
- **Plugins** para añadir fuentes (DOUE, BOE histórico, jurisprudencia)
- **Internacionalización** del corpus (legislación de otros países)
- **App móvil** (PWA o nativa)
- **Plantillas comunitarias** — repo paralelo `lexflow-templates` con PRs de la comunidad
- **Modo colaborativo offline** — CRDT para edición compartida sin servidor

---

> Este roadmap es un documento vivo. Cualquier cambio sustantivo viene acompañado de PR + actualización de las milestones de GitHub.
