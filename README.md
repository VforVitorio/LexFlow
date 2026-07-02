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
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/react-18-61dafb.svg" alt="React" /></a>
  <a href="https://github.com/VforVitorio/LexFlow/issues"><img src="https://img.shields.io/github/issues/VforVitorio/LexFlow" alt="Issues" /></a>
  <img src="https://img.shields.io/badge/status-pre--alpha-orange" alt="Status" />
</p>

---

LexFlow transforma [legalize-es](https://github.com/legalize-dev/legalize-es) — el corpus de leyes españolas en Markdown, versionado con Git — en una plataforma interactiva para explorarlas, entenderlas y consultarlas. Objetivo final: una app de escritorio standalone, sin Docker ni Python para el usuario.

## Qué puedes hacer

- **Buscar leyes** — full-text, semántica e híbrida; por `#tag` (materias BOE), por acrónimo o nombre corto (LOPD, LEC…), por ministerio, o navegando por comunidad autónoma.
- **Navegar el grafo de conocimiento** — cross-referencias entre leyes y artículos, con un panel de "leyes relacionadas".
- **Hablar con el chatbot legal** — responde con herramientas reales vía MCP, en local (Ollama, LM Studio) o en la nube (OpenAI, Anthropic, Google).
- **Consultar dashboards** — compliance y tendencias legislativas.
- **Redactar en el editor** — citas tipadas, plantillas, borrador asistido por IA y comentarios inline.
- **Organizar con tags propias** y revisar el historial de versiones y diffs de cada ley (del git de legalize-es).

## Inicio rápido

Requisitos: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js.

```bash
git clone https://github.com/VforVitorio/LexFlow.git
cd LexFlow
git submodule update --init --recursive   # corpus de legalize-es
uv sync --all-extras
uv run python main.py                     # backend en :8000, docs interactivas en /docs
```

```bash
cd frontend
npm install
npm run dev                               # Vite en :5173, proxy /api → :8000
```

> Atajo: `./scripts/dev.ps1` arranca backend + frontend a la vez.

**Producción** (un solo proceso): `cd frontend && npm run build && cd .. && uv run python main.py` — FastAPI sirve la API bajo `/api/v1` y el SPA en `/`.

## Stack

- **Backend** — Python 3.12, FastAPI + Pydantic v2, NetworkX (grafo), FastMCP (chat), uv, Ruff, mypy, pytest.
- **Frontend** — React 18 + TypeScript, Vite, TanStack Query, Zustand, Tailwind CSS, Vitest + Playwright.

## Arquitectura

Cuatro capas sobre el mismo corpus: **API REST**, **grafo de conocimiento**, **chat legal** y **dashboards**.

```text
LexFlow/
├── src/lexflow/       # backend: api/ core/ chat/ graph/ dashboards/
├── frontend/          # React + TypeScript (Vite)
├── data/legalize-es/  # submódulo: corpus de leyes
├── tests/             # pytest
└── main.py            # entry point del backend
```

Toda la API vive bajo `/api/v1/*`. Documentación interactiva en `/docs`; inventario completo en [`docs/backend/api-endpoints.md`](docs/backend/api-endpoints.md).

## Documentación y contribuir

- [CLAUDE.md](CLAUDE.md) — stack, convenciones y contrato API ↔ frontend.
- [ROADMAP.md](ROADMAP.md) — plan por fases.
- [CONTRIBUTING.md](CONTRIBUTING.md) — cómo abrir una PR.

Flujo trunk-based: rama `feat/xxx` / `fix/xxx` / `docs/xxx` desde `main`, PR de vuelta a `main`, CI (`test`, `lint`, `typecheck`) en verde y sin squash — se preserva el histórico completo.

## Créditos

Este proyecto existe gracias a [legalize-es](https://github.com/legalize-dev/legalize-es), que recopila y versiona legislación española en Markdown.

## Licencia

[Apache 2.0](LICENSE) — Copyright 2026 VforVitorio.
