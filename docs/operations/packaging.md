# Packaging and Distribution

LexFlow is meant for a non-technical audience: download, double-click, run.
The packaging story has two stages — Docker today, native binaries planned.

## Today: Docker

[`Dockerfile`](../../Dockerfile) is a two-stage build:

1. **`builder`** — `python:3.12-slim`. Installs `uv`, copies `pyproject.toml`
   and `uv.lock`, runs `uv sync --frozen --no-dev --no-editable` to produce
   `.venv/`.
2. **`runtime`** — `python:3.12-slim`. Copies the venv from the builder,
   then `src/`, `main.py`, and `data/`. Exposes `8000` and runs
   `python main.py`.

[`docker-compose.yml`](../../docker-compose.yml) wires it up:

- Service `lexflow` builds from the local Dockerfile.
- Port `${LEXFLOW_PORT:-8000}:8000`.
- Volume `lexflow-data:/app/data/legalize-es` (the corpus submodule lives
  here so a `docker compose up` followed by `docker compose down` does not
  lose the cloned data).
- Env: `LEXFLOW_HOST=0.0.0.0`, `LEXFLOW_PORT=8000`, `LEXFLOW_LOG_LEVEL`.
- Healthcheck: `urllib.request.urlopen('http://localhost:8000/health')`
  every 30 s (see [observability.md](./observability.md) for the endpoint).

Docker is the **server-side** option. Anyone hosting LexFlow for a team
should use it. End users should not need to install Docker.

## Planned: standalone binaries (Roadmap Phase 6)

[`ROADMAP.md`](../../ROADMAP.md) — Phase 6 ("Producto: empaquetado y
distribución") covers single-file native binaries:

| Target                | Status    |
|-----------------------|-----------|
| PyInstaller / Nuitka  | Pending   |
| Windows `.exe` / `.msi` | Pending |
| macOS `.dmg`          | Pending   |
| Linux `.AppImage` / `.deb` | Pending |
| GitHub Releases per platform | Pending |
| CI/CD for release builds | Pending |
| Download landing page | Pending   |
| Auto-update or version-notify | Pending |

Completion criterion (from ROADMAP): *"A non-technical user downloads
LexFlow from GitHub, double-clicks, and starts using it."*

### Constraint: ship `legalize-es` inside the binary

The legalize-es corpus is currently a **git submodule** under
[`data/legalize-es/`](../../data/legalize-es/). For a standalone binary it
**must travel inside the artefact**. A user who downloads `LexFlow.exe`
cannot be expected to run `git submodule update --init`. The packaging step
must bundle the submodule contents (or a tagged snapshot of it) and the
backend must resolve the corpus path relative to the executable.

### FastAPI static asset mounting

Standalone distribution also needs FastAPI to serve the compiled frontend
(Vite build) from the same process. Tracking issues:

- [#67](https://github.com/VforVitorio/LexFlow/issues/67) — mount frontend
  static build at the FastAPI root.
- [#66](https://github.com/VforVitorio/LexFlow/issues/66) — related static
  mount work.

Until those land, dev runs the API on `:8000` and Vite on `:5173`
([getting-started/running-locally.md](../getting-started/running-locally.md)).

## Picking a route per audience

| Audience              | Route        |
|-----------------------|--------------|
| End user (lawyer, student) | Native binary (planned) |
| Self-hosting team / org    | Docker (today) |
| Developer / contributor    | `uv run python main.py` + Vite dev server |
