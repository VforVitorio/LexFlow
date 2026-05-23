# Coding Conventions

The single source of truth for project-wide conventions is
[`CLAUDE.md`](../../CLAUDE.md) at the repo root. This page is the
contributor-facing summary. When the two disagree, `CLAUDE.md` wins.

## Python

- **Files and modules:** `snake_case.py`. One class per file when the class
  carries non-trivial behaviour; tightly coupled helpers may share a file.
- **Functions and variables:** `snake_case`. Verbs for functions
  (`build_short_name`), nouns for variables (`law_detail`).
- **Classes:** `PascalCase`. One responsibility per class.
- **Constants:** `UPPER_SNAKE_CASE`, declared at module top.
- **Type hints:** required on every public function and method.
- **Type checker:** [mypy](https://mypy.readthedocs.io/) in **strict** mode
  (`uv run mypy src/lexflow/`).
- **Linter and formatter:** [Ruff](https://docs.astral.sh/ruff/), line length
  **120**. Run `uv run ruff check .` and `uv run ruff format --check .`
  before pushing.
- **Docstrings:** module, class, and public-function docstrings document
  *why*, not *what*. See `CLAUDE.md` §6 for the full template.

## TypeScript

- **Component files:** `PascalCase.tsx` (`ArticleBlock.tsx`,
  `CommandPalette.tsx`). One component per file.
- **Util / hook files:** `kebab-case.ts` (`api.mock.ts`, `mock-data.ts`,
  `vite-env.d.ts`). When a file holds a single React hook, also acceptable
  is `useThing.ts`.
- **Functions and variables:** `camelCase`. Boolean names read as questions
  (`isOpen`, `hasResults`).
- **Types and interfaces:** `PascalCase` (`LawDetail`, `ApiClient`).
- **Constants:** `UPPER_SNAKE_CASE` at module top
  (`USE_MOCK`, `API_PREFIX`).
- **Imports:** prefer the `@/` alias for `frontend/src/*`
  (`import { Button } from '@/components/ui'`).

## Tests

- **Python:** `tests/` mirrors `src/lexflow/`. Files named `test_<module>.py`,
  functions named `test_<what>` (`test_parse_law_with_no_articles`).
  Use `pytest` + `pytest-asyncio` for async tests.
- **TypeScript:** colocated as `<thing>.test.ts` (or `.test.tsx`) next to the
  unit under test.

### Integration tests use real data

LexFlow's data layer is read-only over a git checkout of legalize-es. **Do
not mock the database / filesystem** in integration tests — load real
fixtures from `data/legalize-es/` (or a slimmed-down test corpus). Mocks are
fine for the *chat provider* and *external HTTP* surfaces, where the
non-determinism is not about us.

## Commit messages

- English, imperative mood ("Add law diff endpoint", not "Added" /
  "Adds"). See [git-workflow.md](./git-workflow.md).
- Conventional Commits are honoured by
  [release-please](../operations/ci-cd.md#release-pleaseyml--releases), so
  `feat:` / `fix:` / `docs:` prefixes drive automated versioning.

## Clean-code rules

`CLAUDE.md` §7 (the project-level clean-code section) covers:

- Small, single-purpose functions; orchestrators compose helpers.
- Max 2 levels of nesting; prefer early-return guard clauses.
- No premature abstraction (wait for the third duplication).
- Names that make comments unnecessary.
- "Where to change if X changes" breadcrumbs in non-obvious docstrings.

Read it once before your first PR. Re-read it any time a reviewer points at
the same section twice.
