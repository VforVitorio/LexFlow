# Roadmap de LexFlow

Este documento describe las fases de desarrollo de LexFlow. Para el plan
detallado de las fases en curso y futuras, ver
[`docs/planning/ROADMAP-v2.md`](docs/planning/ROADMAP-v2.md).

Actualizado: 2026-06-05 (release 0.36.x).

---

## Estado consolidado

| Fase | Título | Estado |
|------|--------|--------|
| 0 | Fundación (repo, CI/CD, branch protection, dependabot) | ✅ Hecho |
| 1 | API base + parser legalize-es + búsqueda full-text | ✅ Hecho |
| 2 | Grafo de conocimiento (NetworkX, PageRank, edge typing, xyflow viz) | ✅ Hecho |
| 3 | Chatbot (Ollama, LM Studio, OpenAI, Anthropic, Google + FastMCP + tool-use loop) | ✅ Hecho |
| 4 | Dashboards Plotly (compliance + analytics) | ✅ Hecho |
| 5 | Frontend React (explorer, grafo, chat, dashboards, settings, i18n ES/EN) | ✅ Hecho |
| 6 | Empaquetado y distribución como app de escritorio | Parcial — PyInstaller backend + landing listos; Tauri/signing/auto-update pendientes — ver [`docs/planning/DISTRIBUTION.md`](docs/planning/DISTRIBUTION.md) |
| 7 | Búsqueda semántica y RAG | Infra placeholder en main (#369) — falta embedder real + hybrid ranking + persistencia |
| 8 | UX & Onboarding (greeting, tour Reactour, wizard de modelos, accesibilidad axe-core) | ✅ Hecho — ver [`docs/planning/UX-ONBOARDING.md`](docs/planning/UX-ONBOARDING.md) |
| 9 | Personalización & MCP extensibility (templates, servers externos, `.mcpb`) | ✅ Hecho — ver [`docs/planning/MCP-INTEGRATION.md`](docs/planning/MCP-INTEGRATION.md) |

### Strands transversales (no encajan en una fase única)

| Strand | Estado |
|--------|--------|
| Observability (JSON logs + request-id correlation + extended health endpoint) | ✅ Hecho (Sprint 9 / #92 / #330) |
| Rate limiting per cloud provider (`LEXFLOW_RATE_*_RPM`) | ✅ Hecho (Sprint 9 / #93) |
| OS-keyring para cloud API keys + `/api/v1/secrets` | ✅ Hecho (Sprint 11 / #362) |
| MCP client interno + `.mcpb` bundles + `/api/v1/mcp/tools` | ✅ Hecho (Sprint 11 / #364 / #365) |
| Telemetry opt-in (two-gate: env operator + Zustand user) | ✅ Hecho (Sprint 9 + 14 / #331 / #371) |
| i18n full pass (ES por defecto, EN como segundo idioma) | ✅ Hecho (releases 0.29-0.33) |

---

## Planes detallados por área

| Documento | Cubre |
|-----------|-------|
| [`docs/planning/ROADMAP-v2.md`](docs/planning/ROADMAP-v2.md) | Roadmap completo con sub-epics, criterios de "hecho" y dependencias |
| [`docs/planning/UX-ONBOARDING.md`](docs/planning/UX-ONBOARDING.md) | Greeting flow sin cuenta, tutorial sombreado (Reactour v3), wizard de modelos, guided actions |
| [`docs/planning/MODELS.md`](docs/planning/MODELS.md) | Recomendación de modelos por hardware tier — local (Ollama Llama 3.2 / Qwen 2.5) y cloud (Claude / GPT / Gemini) |
| [`docs/planning/MCP-INTEGRATION.md`](docs/planning/MCP-INTEGRATION.md) | Cómo LexFlow consume MCP servers externos (`fetch`, `filesystem`, `mcp-pandoc`, `boe-mcp`) y acepta `.mcpb` bundles |
| [`docs/planning/DISTRIBUTION.md`](docs/planning/DISTRIBUTION.md) | Decisión Tauri 2 + PyInstaller sidecar, code signing, auto-update |
| [`docs/planning/INSTALL.md`](docs/planning/INSTALL.md) | Guía de instalación para usuario final + para devs |
| [`docs/planning/ACCESSIBILITY.md`](docs/planning/ACCESSIBILITY.md) | Principios, checklist WCAG 2.1 AA, auditoría axe-core en CI |

---

## Issues abiertas que cierran el roadmap

Trabajo restante después de release 0.36.x — [7 issues abiertas en total](https://github.com/VforVitorio/LexFlow/issues):

**Epic [#37](https://github.com/VforVitorio/LexFlow/issues/37) — Packaging completion** (bloqueado en infra externa)
- [#125](https://github.com/VforVitorio/LexFlow/issues/125) Tauri 2 + PyInstaller sidecar (Rust toolchain + Tauri pipeline)
- [#127](https://github.com/VforVitorio/LexFlow/issues/127) Code signing Windows + macOS (certs Azure Trusted Signing + Apple Developer)
- [#128](https://github.com/VforVitorio/LexFlow/issues/128) Auto-update con Tauri Updater + release server

**Epic [#41](https://github.com/VforVitorio/LexFlow/issues/41) — Semantic search / RAG**
- [#43](https://github.com/VforVitorio/LexFlow/issues/43) Endpoint semántico + RAG pipeline (infra placeholder en main vía #369; falta embedder real)
- [#108](https://github.com/VforVitorio/LexFlow/issues/108) Editor de documentos legales con citas tipadas (depende de #43)

---

## Principios de producto (no negociables)

1. **Cero cuentas.** No hay registro, no hay login, no hay PII al servidor. El único dato personal es el nombre de pila opcional que se pregunta al primer arranque y se guarda en `localStorage`.
2. **Doble distribución.** Instalador (`.exe`/`.dmg`/`.AppImage`) para usuarios; `uv run python main.py` para devs. Mismo binario por SO.
3. **Guía siempre que sea manual.** Si algo no se automatiza con un botón, se acompaña con un wizard, dialog o tutorial sombreado. Nunca "edita este JSON".

---

## Futuro abierto

Ideas que podrían explorarse en fases posteriores:

- **Base de datos de grafos** (Neo4j) para reemplazar NetworkX a escala.
- **Notificaciones push** de cambios legislativos.
- **API pública** para que terceros integren datos legales.
- **Plugins** para añadir fuentes (DOUE, BOE histórico, jurisprudencia).
- **Internacionalización del corpus** (legislación de otros países).
- **App móvil** (PWA o nativa).
- **Plantillas comunitarias** — repo paralelo `lexflow-templates` con PRs de la comunidad.
- **Modo colaborativo offline** — CRDT para edición compartida sin servidor.

---

> Este roadmap es un documento vivo. Cualquier cambio sustantivo viene acompañado de PR + actualización de los hitos de GitHub.
