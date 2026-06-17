# Pull Requests

Every change to LexFlow lands through a PR. Direct pushes to `main`
are rejected by branch protection.

## Opening a PR

1. Push your feature branch (`feat/*`, `fix/*`, or `docs/*` — see
   [git-workflow.md](./git-workflow.md)).
2. Target **`main`**.
3. Fill in the PR template — see below.

## The PR template

[`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md)
is loaded automatically into every new PR. It asks for:

- **Descripción** — what the PR does and why.
- **Issue relacionado** — `closes #XX` or `relates to #XX`.
- **Tipo de cambio** — bug fix, feature, refactor, docs, CI/CD, other.
- **Checklist:**
  - Read [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
  - Code follows project conventions
    (see [conventions.md](./conventions.md)).
  - Tests added for the change.
  - `uv run pytest` passes.
  - `uv run ruff check .` passes.
  - `uv run ruff format --check .` passes.
  - Documentation updated where relevant.
- **Capturas o evidencia** — screenshots, logs, test output.
- **Notas para el reviewer** — anything specific the reviewer should look
  at.

The template is currently in Spanish; the prose you fill in can be in either
language. Commit messages stay in English
([git-workflow.md](./git-workflow.md)).

## CI gates

Every PR triggers [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
Three required contexts:

| Job        | What it runs                                  |
|------------|-----------------------------------------------|
| `test`     | `uv run pytest -v` (`--all-extras --frozen`)  |
| `lint`     | `uvx ruff check .` + `uvx ruff format --check .` |
| `typecheck`| `uv run mypy src/lexflow/`                    |

All three are required *strictly* (`strict: true` — PR must be up to date
with `main`).

If `lint` or `typecheck` fails, fix locally and push again — do **not**
silence the check with `# type: ignore` or `# noqa` blindly.

## Reviews

CI green is a prerequisite; reviews are encouraged. The branch-protection
rule requires conversation resolution before merge.

Be specific in review comments — point at lines, suggest replacements
inline. The
[clean-code section in `CLAUDE.md`](../../CLAUDE.md) is the shared rubric.

## Labels

Labels are applied automatically by
[`.github/workflows/labeler.yml`](../../.github/workflows/labeler.yml) based
on the changed files. The mapping lives in
[`.github/labeler.yml`](../../.github/labeler.yml). Possible `area:*`
labels:

`area: api`, `area: graph`, `area: chat`, `area: dashboards`,
`area: frontend`, `area: core`, `area: codebase`, `area: deps`,
`area: ci-cd`, `area: docs`, `area: tests`, `area: data`.

Authors should **not** set `area:*` labels by hand. `sync-labels: true`
removes labels whose globs no longer match.

Two labels are applied manually:

- `dependencies` — set by dependabot on its own PRs.
- `do-not-rebase` — tell `auto-update-prs.yml` to leave a PR alone.

## Keeping the branch fresh

Branch protection on `main` is **strict**: an out-of-date PR cannot merge
until it is updated against `main`. To avoid manual "Update branch" clicks
on dependency bumps,
[`.github/workflows/auto-update-prs.yml`](../../.github/workflows/auto-update-prs.yml)
runs on every push to `main` and calls the `update-branch` endpoint
on every open PR labelled `area: deps` or `area: ci-cd` (unless
`do-not-rebase` is set). See
[operations/ci-cd.md](../operations/ci-cd.md#auto-update-prsyml--keep-prs-rebased).

For your own feature PRs, rebase manually:

```bash
git switch feat/your-thing
git fetch origin
git rebase origin/main
git push --force-with-lease
```

`--force-with-lease` is safe on feature branches; it is **never** allowed on
`main`.

## After merge

GitHub auto-deletes the head branch. Locally:

```bash
git switch main
git pull
git fetch --prune
```
