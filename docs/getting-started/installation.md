# Installation

First-time setup for a LexFlow development environment on Windows, macOS or Linux.

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Python | 3.12+ | Backend runtime (`pyproject.toml` sets `requires-python = ">=3.12"`) |
| uv | latest | Python dependency manager — replaces pip/poetry |
| Git | 2.30+ | The legalize-es data is a submodule under `data/legalize-es` |
| Node.js | 20 LTS+ | Frontend toolchain (Vite + React 18) |
| pnpm or npm | recent | JS package manager (pick one and stick with it — `package.json` works with either) |

### Install uv

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Verify with `uv --version`.

### Install Node + pnpm

Use [nvm](https://github.com/nvm-sh/nvm) or [Volta](https://volta.sh/) to manage Node. Then:

```bash
corepack enable          # ships with Node 16+
corepack prepare pnpm@latest --activate
```

## Clone

```bash
git clone https://github.com/VforVitorio/LexFlow.git
cd LexFlow

# The legalize-es corpus is a git submodule. Without --recursive it stays empty.
git submodule update --init --recursive
```

The corpus lands at `data/legalize-es/` (see [`.gitmodules`](../../.gitmodules)).
Backend reads it through [`src/lexflow/utils/config.py`](../../src/lexflow/utils/config.py)
(`DEFAULT_DATA_PATH = PROJECT_ROOT / "data" / "legalize-es"`).

## Backend dependencies

```bash
uv sync --all-extras
```

This creates `.venv/` and installs the base deps plus the `chat`, `dashboards`,
`packaging`, and `dev` extras. The `chat` extra is heavy (anthropic, openai,
google-genai, fastmcp, ollama); drop `--all-extras` and pass just `--extra dev`
if you only need the API.

Pinned versions live in `uv.lock`. The CI jobs always use `--frozen` against
that lockfile.

## Frontend dependencies

```bash
cd frontend
cp .env.example .env.local
pnpm install         # or: npm install
```

`.env.local` is the only file you need to edit before running. The defaults
keep the UI in mock mode so you can see the app without a backend.

## Verify everything

```bash
# From repo root
uv run pytest -q
uv run ruff check .
uv run mypy src/lexflow/

# From frontend/
pnpm typecheck
pnpm lint
```

All four must succeed before you push.

## What next

- [running-locally.md](running-locally.md) — start the dev servers
- [troubleshooting.md](troubleshooting.md) — when something goes wrong
