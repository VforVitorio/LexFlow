# LexFlow Documentation

Developer documentation for [LexFlow](../README.md) — a FastAPI + React platform that turns the
[legalize-es](https://github.com/legalize-dev/legalize-es) corpus of Spanish legislation into an
interactive product (API, knowledge graph, chatbot, dashboards).

The single source of truth for conventions and tech-stack decisions is
[`CLAUDE.md`](../CLAUDE.md) at the repo root. This tree expands it into
task-oriented pages.

---

## Getting started

| File | What it covers |
|------|----------------|
| [installation.md](getting-started/installation.md) | Python 3.12, uv, Node 20, pnpm/npm — first-time setup |
| [running-locally.md](getting-started/running-locally.md) | Backend on `:8000`, Vite on `:5173`, mock vs live mode |
| [troubleshooting.md](getting-started/troubleshooting.md) | Common pitfalls (`.venv` orphans, submodule empty, stale frontend `lib/`) |

## Architecture

| File | What it covers |
|------|----------------|
| [overview.md](architecture/overview.md) | The four layers (API, graph, chat, dashboards) and how they connect |
| [backend.md](architecture/backend.md) | `src/lexflow/` package layout, key abstractions, module boundaries |
| [frontend.md](architecture/frontend.md) | `frontend/src/` layout, routing model, state split |
| [api-contract.md](architecture/api-contract.md) | `/api/v1/*` contract, error shape, versioning, generated types |

## Backend reference

| File | What it covers |
|------|----------------|
| [api-endpoints.md](backend/api-endpoints.md) | Every router under `src/lexflow/api/routers/` with method, path, params |
| [core-models.md](backend/core-models.md) | `Law`, `Article`, `Section`, `Reference`, `LawMetadata`, `LawVersion`, `LawDiff` |
| [graph.md](backend/graph.md) | `LegalGraph`, algorithms (PageRank, shortest path, communities), cache |
| [chat-and-mcp.md](backend/chat-and-mcp.md) | `ChatProvider` interface, the five providers, MCP server tools |
| [dashboards.md](backend/dashboards.md) | Plotly figure builders for analytics and compliance |

## Frontend reference

| File | What it covers |
|------|----------------|
| [component-library.md](frontend/component-library.md) | `ui/` primitives, `shell/`, `domain/` components |
| [pages-and-routing.md](frontend/pages-and-routing.md) | All 11 routes and their pages |
| [state-and-data.md](frontend/state-and-data.md) | TanStack Query hooks + Zustand UI store |
| [api-client.md](frontend/api-client.md) | `src/lib/api.ts` (planned), expected response shapes, mock fallback |

## Operations

| File | What it covers |
|------|----------------|
| [ci-cd.md](operations/ci-cd.md) | GitHub Actions workflows, required checks, dependabot |
| [packaging.md](operations/packaging.md) | Docker (today), PyInstaller (planned), distribution targets |
| [observability.md](operations/observability.md) | Logging today, planned tracing/metrics |

## Contributing

| File | What it covers |
|------|----------------|
| [conventions.md](contributing/conventions.md) | Python + TypeScript coding conventions |
| [git-workflow.md](contributing/git-workflow.md) | trunk-based (`main` only), `feat-*`/`fix-*`/`docs-*` off `main`, no squash, branch auto-delete |
| [pull-requests.md](contributing/pull-requests.md) | PR template, required checks, review etiquette |

---

## Legacy documents (kept for now)

- [`architecture.md`](architecture.md) — original Spanish architecture brief. Predates the
  React migration; superseded by [`architecture/overview.md`](architecture/overview.md)
  and [`architecture/backend.md`](architecture/backend.md). Will be archived once
  the new tree is reviewed.
- [`project-pitch.md`](project-pitch.md) — original Spanish pitch. Superseded by the
  repo-root [`README.md`](../README.md).

Both still reference Reflex; do not treat them as authoritative for stack
decisions. See [`CLAUDE.md` §2](../CLAUDE.md) for the current stack.
