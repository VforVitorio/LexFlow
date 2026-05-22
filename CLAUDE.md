# LexFlow — Claude Code Context

This file is the **source of truth** for how Claude (and any contributor) should work in this repo. It supersedes any older convention found in commits or docs.

---

## 1. Project overview

LexFlow is an open source platform for exploring, analysing and querying Spanish legislation. It transforms the [legalize-es](https://github.com/legalize-dev/legalize-es) repository (laws in Markdown, versioned with Git) into an interactive product with four layers:

1. **REST API** (FastAPI) — laws, articles, versions, diffs, search, statistics.
2. **Knowledge graph** (NetworkX) — cross-references between laws and articles, navigable like Obsidian.
3. **Legal chatbot** (FastMCP + Ollama / LM Studio / OpenAI / Anthropic / Google) — answers questions using real API tools.
4. **Analytics dashboards** (Plotly) — compliance tracking + legislative trends.

End-state: a standalone desktop app (`.exe`, `.dmg`, `.AppImage`) bundling FastAPI + the React build, ready for non-technical users. Docker is optional.

---

## 2. Tech stack

### Backend (Python 3.12+)

| Concern | Tool |
|---|---|
| Web framework | FastAPI + Uvicorn |
| Validation | Pydantic v2 |
| Graph | NetworkX (in-memory; Neo4j is Phase 7+) |
| Chat / MCP | FastMCP, Ollama, LM Studio, OpenAI, Anthropic, Google |
| Dashboards data | Plotly (figures returned as JSON, rendered in React) |
| Package manager | uv |
| Linter / formatter | Ruff (line-length 120) |
| Type checker | mypy (strict) |
| Tests | pytest + pytest-asyncio (real data, no DB mocks) |
| Packaging | PyInstaller |

### Frontend (TypeScript)

| Concern | Tool |
|---|---|
| Build | Vite |
| Framework | React 19 |
| Routing | TanStack Router (file-based, typed) |
| Server state | TanStack Query |
| Client / UI state | Zustand |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives) |
| Graph viz | react-flow |
| Charts | plotly.js-dist + react-plotly.js |
| API types | `openapi-typescript` (generated from FastAPI's `/openapi.json`) |
| HTTP client | thin `ky` wrapper over the generated types |
| Unit tests | Vitest |
| E2E tests | Playwright (against a real FastAPI dev server) |
| Package manager | pnpm (or npm — pick once, stick with it) |

> **Reflex was the original choice and is now retired.** See `memory/decision_frontend_react_stack.md` for the reasoning. If something blocks the React+FastAPI integration, surface the blocker before silently reverting.

---

## 3. Project structure

```
LexFlow/
├── src/lexflow/        # Python backend
│   ├── api/            # FastAPI endpoints
│   ├── core/           # Domain models, parsers, business logic
│   ├── chat/           # Chatbot + MCP tools
│   ├── graph/          # Knowledge graph (NetworkX)
│   ├── dashboards/     # Analytics data (Plotly figures as JSON)
│   └── utils/          # Config, logging, helpers
├── frontend/           # React app
│   ├── src/
│   │   ├── api/        # Generated schema.ts + typed client
│   │   ├── pages/      # TanStack Router routes
│   │   ├── components/ # shadcn primitives + composed UI
│   │   ├── stores/     # Zustand stores
│   │   ├── hooks/      # TanStack Query custom hooks
│   │   ├── types/      # Cross-cutting TS types
│   │   └── lib/        # Utils, formatters
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
├── tests/              # Python test suite (mirrors src/)
├── docs/               # Project documentation
├── assets/             # Images and static resources
├── scripts/            # Setup / maintenance scripts
├── data/               # legalize-es submodule + processed artefacts
├── .github/            # CI/CD, issue templates, PR template
├── main.py             # Backend entry point
└── pyproject.toml      # Python project config
```

---

## 4. Git workflow

- `main` — protected (strict; contexts `test, lint, typecheck`; conversation resolution required). Only receives PRs from `dev`.
- `dev` — integration branch. All features and fixes merge here first.
- Feature branches: `feat/<name>`, `fix/<name>`, `docs/<name>`, branched off `dev`.
- **No squash merges.** Full commit history is preserved.
- Delete branches after merge.

When CI fails on `main`, fix the failure — never bypass with `enforce_admins`.

---

## 5. Commands

### Backend

```bash
uv sync --all-extras          # Install all Python dependencies
uv run pytest -v              # Run backend tests
uv run ruff check .           # Lint
uv run ruff format --check .  # Check formatting
uv run mypy src/lexflow/      # Type check
uv run python main.py         # Start backend dev server (:8000)
```

### Frontend (once `frontend/` exists)

```bash
cd frontend
pnpm install                  # Install JS dependencies
pnpm dev                      # Vite dev server (:5173), proxies /api → :8000
pnpm test                     # Vitest unit tests
pnpm test:e2e                 # Playwright e2e (boots backend + frontend)
pnpm typecheck                # tsc --noEmit
pnpm lint                     # ESLint
pnpm build                    # Production build → frontend/dist/
pnpm generate:api             # openapi-typescript from running backend
```

### Full-stack (one process, prod-like)

```bash
cd frontend && pnpm build && cd ..
uv run python main.py         # FastAPI serves API at /api/v1 and SPA at /
```

---

## 6. FastAPI ↔ React contract

Read this before touching either side.

- **Dev mode**: backend on `:8000`, Vite on `:5173`. Vite proxies `/api/*` → `http://localhost:8000/api/*`. No CORS configuration needed in dev.
- **Prod mode**: single FastAPI process. Serves the API under `/api/v1/*` and mounts `frontend/dist/` at `/` as static files (`StaticFiles` + a catch-all returning `index.html` for SPA routes).
- **API versioning**: every endpoint lives under `/api/v1/`. Breaking changes bump to `/api/v2/` — never silently change `/api/v1/` responses.
- **Types**: regenerate `frontend/src/api/schema.ts` whenever a Pydantic model or endpoint signature changes. CI will eventually fail if the committed `schema.ts` is stale.
- **Error contract**: backend returns `{ "detail": "<message>" }` on 4xx/5xx (FastAPI default). Frontend has a single error boundary that reads `detail` and surfaces a toast.
- **Auth (when added)**: cookie-based session, `SameSite=Lax`, `HttpOnly`, `Secure` in prod. Do not put JWTs in localStorage.
- **Streaming (chat)**: SSE over `GET /api/v1/chat/stream?...`. Frontend uses native `EventSource` + a TanStack Query mutation for the kickoff request.
- **Never hand-write types that duplicate Pydantic models.** Use the generated schema.

If the integration ever blocks progress (build, packaging, streaming, auth), surface the specific failure first. The fallback is to keep Reflex for that one page — but the user has explicitly stated this is *not* recommended.

---

## 7. Code quality principles

These apply to all code in any language. They override "speed" — do not skip them to ship faster.

### Functions

- One job per function. If the name needs "and", split it.
- Big functions are orchestrators of small helpers. Past ~30 lines or when "sections" appear (blank lines, `# now do X` comments), extract.
- Helpers live next to their caller — same module, ideally just above the calling function. No catch-all `utils.py`.
- Pure functions where possible. Side effects (I/O, mutation, logging) live at the edges, not deep inside transforms.

### Simplicity

- Boring code beats clever code. A plain `for` + `if` beats a nested comprehension with a ternary inside a `filter`.
- Max 2 levels of nesting. A third level means extract a helper, invert the data, or use early returns.
- Lambdas only for one-line transforms. The moment a lambda branches or grows past ~30 characters, give it a name with `def`.
- Early-return guard clauses flatten code. `if not x: return` beats wrapping the whole body in `if x:`.
- No premature abstraction. Three similar lines is better than a half-baked helper used once.

### Structure

- Use a class when state + behaviour travel together. Don't wrap a pure transform in `class Formatter`.
- One class per file (or one tightly related group). File name matches the class.
- Constants at the top, named `UPPER_SNAKE_CASE`. No magic numbers mid-logic.
- Split modules past ~300 lines or covering multiple concerns. Split by concern (`auth.py`, `routes.py`, `models.py`), not by size.

### Names

- Names make comments unnecessary. `total_seconds` beats `t  # in seconds`.
- Verbs for functions, nouns for variables. Booleans read as questions: `is_ready`, `has_permission`.
- No abbreviations except universal ones (`id`, `url`, `http`, `db`).

### Docstrings (the ONE place comments are expected)

- Every module gets a top docstring (1-3 lines: what + invariants).
- Every class gets a docstring with one-line summary + `Features:` / `Invariants:` / `Responsibilities:` bullets when behaviour is non-obvious.
- Every public function or method gets a docstring. One line is enough if the signature is self-explanatory. Add `Args:` / `Returns:` / `Raises:` only when names don't tell the whole story.
- Skip docstrings on trivial getters, one-line lambdas, private helpers under ~5 lines whose name says everything.
- Document **why**, not **what**. Body says what; docstring captures invariants, edge cases, and "where to change if X changes" breadcrumbs.

### Error handling

- Validate at boundaries, trust inside. User input, external APIs, file I/O — validate there. Internal calls between trusted modules — trust the types.
- Catch specific exceptions, never bare `except:` or bare `Exception`.
- Fail loudly in dev, gracefully at runtime. Startup misconfig should crash with a clear message; transient network errors retry or return a clean fallback.

### Notebooks (`.ipynb`)

Every logical step uses exactly five cells, in order: markdown context → helpers → main → execution → markdown analysis. Restart-kernel-and-run-all must work. No mixing concerns across cells. See `~/.claude/CLEAN_CODE.md` for the full rule.

### React-specific (frontend)

- Components are functions. Hooks live at the top, JSX returns last.
- One component per file when the component is non-trivial. Co-locate dumb sub-components in the same file.
- Server state → TanStack Query. Client state → Zustand. **Never** mix them — a query result does not go into a Zustand store.
- No prop drilling deeper than two levels. Reach for a Zustand store or a Context.
- Performance order of attack (Vercel's rule): waterfalls → bundle → SSR perf → fetching → re-renders → render → JS perf → advanced. Don't reach for `useMemo` before you've checked the waterfall.
- TypeScript strict mode on. No `any`. Use `unknown` and narrow.

### Conventions summary

| Subject | Rule |
|---|---|
| Commit messages | English, imperative (`Add`, `Fix`, `Update`, ...) |
| Python files / modules | `snake_case` |
| Python classes | `PascalCase` |
| Python functions / variables | `snake_case` |
| Python constants | `UPPER_SNAKE_CASE` |
| TS files | `kebab-case.ts` for utils, `PascalCase.tsx` for components |
| TS components | `PascalCase` |
| TS functions / variables | `camelCase` |
| TS constants | `UPPER_SNAKE_CASE` |
| Tests | `test_<module>.py` / `<thing>.test.ts` |
| Integration tests | Use real data, no DB mocks |

---

## 8. Workflow rules

### Long-running work — never just wait

When something the agent triggered is taking time (CI run, `uv sync`, a long test suite, a remote PR check, a `gh pr merge --auto`), do **not** sit idle polling it. Use the wait window for useful work:

- prepare the next branch's rebase or conflict survey
- read the next issue's body and lay out the implementation
- update memory or `MEMORY.md` with what was learned
- batch any small follow-ups (gitignore tweaks, doc fixes, label updates)
- run local checks (`pytest`, `ruff`, `mypy`) on something that will need them next

When the long task finishes (or the harness notifies you), resume the original flow. The only thing that should block on a wait is the *next* action that strictly needs that wait's result. If a PR sits without updating for an unusually long time (no CI activity, no reviewers, no auto-merge progress), surface it explicitly to the user — do not silently re-poll.

This rule applies to **any** wait, not only PRs.

---

## 9. Tooling notes

- **uv venv**: only the project's `.venv` is supported. If a system `VIRTUAL_ENV` env var points elsewhere, uv warns and ignores it. Do not commit `.venv/`.
- **code-review-graph cache**: skills like `explore-codebase`, `debug-issue`, `refactor-safely`, `review-changes` build a local `graph.db` under `.code-review-graph/`. This folder is gitignored; the file contains absolute paths and is not portable. Regenerate locally as needed.
- **CI workflows**: `ci.yml`, `docs.yml`, `auto-update-prs.yml`, `labeler.yml`, `release-please.yml`. Branch protection on `main` requires `test`, `lint`, `typecheck` jobs to pass — adding a frontend job means updating `scripts/setup-github.sh` `REQUIRED_CONTEXTS` and re-running it.
- **Labels**: `area: {api, graph, chat, dashboards, frontend, core, deps, ci-cd, docs, tests, data, codebase}`, plus `dependencies`, `do-not-rebase`. Created by `scripts/setup-github.sh`.

---

## 10. Recommended Claude Code skills

When working on this repo, prefer these skills (most are already available in session):

- `frontend-design` — for any visual decision; pushes bold, non-generic UI.
- `api-design-principles` — when adding or reviewing endpoints.
- `refactor-fastapi` — for backend cleanup (Pydantic v2, async I/O, DI).
- `code-refactor` — bulk renames / pattern replacements.
- `verify` — drive the running app to confirm a change works end-to-end, not just unit tests.
- `run` — boot the project app in a known-good way.
- `explore-codebase` / `debug-issue` / `refactor-safely` / `review-changes` — graph-powered navigation; first call populates `.code-review-graph/`.
- `simplify` — second-pass review of changed code for reuse / quality.

For deep React work, install from `claudemarketplaces.com`: `vercel-labs/agent-skills/vercel-react-best-practices` and `SpillwaveSolutions/mastering-typescript-skill`.

---

## 11. Lecciones aprendidas (errores que no se repiten)

**Regla**: cuando un error real se corrige (un comando roto, un path incorrecto, una librería mal usada, una regresión introducida, una convención mal aplicada), se añade aquí UNA línea con la lección. Nunca se borran entradas; si una regla queda obsoleta, se añade una nueva marcando la anterior como `(superseded by YYYY-MM-DD)`.

**Formato**:

```
- **YYYY-MM-DD** — <una línea con el error y la regla corregida>. Causa: <raíz>. Fix: <qué hacer en su lugar>.
```

**Trigger**: solo errores reales (el usuario dijo "no, hazlo así" o un test/lint surfaceó una suposición rota). Las preferencias estéticas van a `memory/feedback_*.md`, no aquí.

### Entradas

- **2026-05-22** — `gh api -F restrictions=` (string vacío) rechaza el payload de branch protection con HTTP 422. Causa: la API espera `null`, no `""`. Fix: pasar el payload completo como JSON con `--input -`.
- **2026-05-22** — Borrar `.venv` con un `python.exe` que apunta a un intérprete inexistente (miniconda movida/desinstalada) provoca `uv` exit 103. Causa: `.venv\Scripts\python.exe` en Windows es un launcher, no un binario; queda huérfano si el target original ya no existe. Fix: `Remove-Item -Recurse -Force .venv` y `uv venv --python 3.12` antes de `uv sync`. Limpiar también `$env:VIRTUAL_ENV` si apunta a un venv viejo.

<!-- añadir nuevas entradas arriba de esta línea -->

---

## 12. Related documents

- `ROADMAP.md` — phase-by-phase plan.
- `CONTRIBUTING.md` — branch flow, PR process.
- `README.md` — user-facing pitch.
- `scripts/setup-github.sh` — applies branch protection + labels.
- `memory/MEMORY.md` (in `~/.claude/projects/.../memory/`) — Claude-side persistent context for this repo.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%)
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
