<p align="center">
  <img src="assets/lexflow-banner.jpeg" alt="LexFlow" width="700" />
</p>

<h3 align="center">Legislación española, viva y navegable.</h3>

<p align="center">
  Plataforma open source para explorar, analizar y consultar legislación española mediante grafos de conocimiento, IA y dashboards interactivos.
</p>

<p align="center">
  <a href="https://github.com/VforVitorio/LexFlow/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/python-3.12+-blue.svg" alt="Python" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/react-19-61dafb.svg" alt="React" /></a>
  <a href="https://github.com/VforVitorio/LexFlow/issues"><img src="https://img.shields.io/github/issues/VforVitorio/LexFlow" alt="Issues" /></a>
  <img src="https://img.shields.io/badge/status-pre--alpha-orange" alt="Status" />
</p>

---

## Qué es LexFlow

LexFlow transforma el repositorio [legalize-es](https://github.com/legalize-dev/legalize-es) — una colección de leyes españolas en Markdown versionada con Git — en una plataforma interactiva con cuatro capas:

| Capa | Descripción |
|------|-------------|
| **API REST** | Endpoints FastAPI para leyes, artículos, versiones, diffs, búsqueda y estadísticas |
| **Grafo de conocimiento** | Modelo NetworkX con PageRank, clustering y endpoints `/graph/neighbors`, `/graph/path`, `/graph/subgraph`, `/graph/stats`, `/graph/top` |
| **Chat legal** | Chatbot con acceso a herramientas reales vía MCP (Ollama, LM Studio, OpenAI, Anthropic, Google) |
| **Dashboards** | Paneles de compliance y analítica legislativa con Plotly |

Backend en **Python 3.12** (FastAPI + Pydantic + NetworkX + FastMCP). Frontend en **React + TypeScript** (Vite + TanStack + Zustand + Tailwind + shadcn/ui). El objetivo final es distribuirlo como app de escritorio standalone — un único binario por sistema operativo, sin Docker ni Python requerido para el usuario final.

---

## Estado del proyecto

| Fase | Estado |
|------|--------|
| 0 — Fundación (repo, CI/CD, branch protection, dependabot) | ✅ Hecho |
| 1 — API base + parseo legalize-es + búsqueda full-text | ✅ Hecho |
| 2 — Grafo de conocimiento (modelo + algoritmos + endpoints + persistencia) | ✅ Backend hecho |
| 3 — Chatbot (Ollama + LM Studio + OpenAI + Anthropic + Google + FastMCP) | ✅ Backend hecho |
| 4 — Dashboards (Plotly: compliance + analytics) | ✅ Backend hecho |
| 5 — Frontend React (layout, explorador, grafo, chat, dashboards) | 🚧 En progreso |
| 6 — Empaquetado y distribución (Docker, PyInstaller, instaladores) | ⚙️ Docker hecho, resto pendiente |
| 7 — Búsqueda semántica y RAG | 📋 Planificado |

Roadmap detallado: [ROADMAP.md](ROADMAP.md). Issues activas: [GitHub Issues](https://github.com/VforVitorio/LexFlow/issues).

---

## Inicio rápido

### Backend (Python)

Requisitos: Python 3.12+ y [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/VforVitorio/LexFlow.git
cd LexFlow

# Inicializar el submódulo de legalize-es (corpus de leyes)
git submodule update --init --recursive

# Instalar dependencias
uv sync --all-extras

# Arrancar el servidor de desarrollo
uv run python main.py
```

La API estará disponible en `http://localhost:8000`. Documentación interactiva en `/docs`.

### Frontend (React) — cuando llegue el scaffold

```bash
cd frontend
pnpm install
pnpm dev          # Vite en :5173 con proxy /api → :8000
pnpm test         # Vitest
pnpm test:e2e     # Playwright contra un backend real
pnpm typecheck    # tsc --noEmit
pnpm build        # → frontend/dist/
```

### Producción (un único proceso)

```bash
cd frontend && pnpm build && cd ..
uv run python main.py          # FastAPI sirve la API en /api/v1 y el SPA en /
```

> **Nota:** la distribución final será un binario standalone (`.exe`, `.dmg`, `.AppImage`) que empaqueta backend + frontend con PyInstaller. Docker es opcional (para despliegues en servidor).

---

## Arquitectura

```text
LexFlow/
├── src/lexflow/          # Backend Python
│   ├── api/              # FastAPI — endpoints REST
│   ├── core/             # Modelos de dominio, parsers, lógica de negocio
│   ├── chat/             # Chatbot + proveedores LLM + MCP server
│   │   └── providers/    # Ollama, LM Studio, OpenAI, Anthropic, Google
│   ├── graph/            # Grafo de conocimiento (NetworkX) + algoritmos + cache
│   ├── dashboards/       # Figuras Plotly (compliance + analytics)
│   └── utils/            # Configuración, logging, helpers
├── frontend/             # React + TypeScript (Vite)
│   └── src/
│       ├── api/          # schema.ts generado de /openapi.json + cliente tipado
│       ├── pages/        # Rutas (TanStack Router)
│       ├── components/   # shadcn/ui primitivos + UI compuesta
│       ├── stores/       # Estado cliente (Zustand)
│       ├── hooks/        # Hooks de TanStack Query
│       └── lib/          # Utilidades, formatters
├── tests/                # pytest (backend)
├── docs/                 # Documentación
├── data/legalize-es/     # Submódulo: corpus de leyes
├── scripts/              # Scripts de mantenimiento (setup-github.sh)
├── .github/              # CI/CD, dependabot, labeler, release-please
├── main.py               # Entry point del backend
├── Dockerfile            # Imagen para despliegue en servidor (opcional)
├── docker-compose.yml    # Stack completo dockerizado
└── pyproject.toml        # Configuración Python
```

---

## Stack tecnológico

### Backend

| Componente | Tecnología |
|---|---|
| Framework web | FastAPI + Uvicorn |
| Validación | Pydantic v2 |
| Grafo | NetworkX (PageRank, clustering, shortest path) |
| Chat | FastMCP, Ollama, LM Studio, OpenAI, Anthropic, Google |
| Dashboards | Plotly (figuras como JSON) |
| Gestor de paquetes | uv |
| Linter / formatter | Ruff (line-length 120) |
| Type checker | mypy strict |
| Tests | pytest + pytest-asyncio |
| Empaquetado | PyInstaller |

### Frontend

| Componente | Tecnología |
|---|---|
| Build | Vite |
| Framework | React 19 + TypeScript strict |
| Routing | TanStack Router (typed, file-based) |
| Server state | TanStack Query |
| Client state | Zustand |
| Styling | Tailwind CSS + shadcn/ui (Radix) |
| Graph viz | react-flow |
| Charts | plotly.js-dist + react-plotly.js |
| HTTP client | `ky` sobre tipos generados con `openapi-typescript` |
| Tests | Vitest + Playwright |
| Gestor de paquetes | pnpm |

> **Reflex** fue el framework original. Se descartó el 2026-05-22 — los detalles del cambio y el contrato FastAPI ↔ React están en [CLAUDE.md](CLAUDE.md) §2 y §6.

---

## Ejemplos de la API

```bash
# Listar leyes (paginado)
curl http://localhost:8000/api/v1/laws?page=1

# Detalle de una ley
curl http://localhost:8000/api/v1/laws/BOE-A-2018-16673

# Vecinos en el grafo
curl http://localhost:8000/api/v1/graph/neighbors/BOE-A-2018-16673

# Camino más corto entre dos normas
curl "http://localhost:8000/api/v1/graph/path?from=BOE-A-2018-16673&to=BOE-A-1978-31229"

# Top 20 leyes por PageRank
curl http://localhost:8000/api/v1/graph/top?metric=pagerank&limit=20

# Búsqueda full-text
curl "http://localhost:8000/api/v1/search?q=protección+de+datos"
```

Toda la API vive bajo `/api/v1/*`. Cambios breaking bumpean a `/api/v2/`.

---

## Contribuir

Las contribuciones son bienvenidas. Lee la [guía de contribución](CONTRIBUTING.md) antes de empezar.

**Flujo rápido:**

1. Abre o busca un [issue](https://github.com/VforVitorio/LexFlow/issues).
2. Crea una rama desde `dev` (`feat/xxx`, `fix/xxx` o `docs/xxx`).
3. Desarrolla y añade tests.
4. Abre PR hacia `dev`.
5. CI corre tres jobs requeridos: `test`, `lint`, `typecheck` (más `frontend-build` cuando exista).
6. Review y merge (sin squash). La rama se borra automáticamente al hacer merge.

`main` está protegido: solo recibe PRs desde `dev` y exige los tres checks anteriores en verde.

---

## Documentación interna

- [CLAUDE.md](CLAUDE.md) — fuente de verdad sobre stack, convenciones, contrato FastAPI ↔ React y lecciones aprendidas.
- [ROADMAP.md](ROADMAP.md) — plan por fases.
- [CONTRIBUTING.md](CONTRIBUTING.md) — flujo de ramas y revisiones.
- [scripts/setup-github.sh](scripts/setup-github.sh) — reaplica branch protection y labels en un repo nuevo.

---

## Créditos

Este proyecto existe gracias a [legalize-es](https://github.com/legalize-dev/legalize-es), el repositorio open source que recopila y versiona legislación española en Markdown. LexFlow construye sobre esa base para convertirla en una plataforma interactiva completa.

---

## Licencia

LexFlow se distribuye bajo la licencia [Apache 2.0](LICENSE).

```
Copyright 2026 VforVitorio

Licensed under the Apache License, Version 2.0
```
