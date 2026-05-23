# CI / CD

All automation lives under [`.github/workflows/`](../../.github/workflows/).
Workflows run on Ubuntu, install Python 3.12 via
[`astral-sh/setup-uv@v7`](https://github.com/astral-sh/setup-uv), and key
their cache off `uv.lock`.

## `ci.yml` — required checks

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on every
push to `main`, `dev`, `feat/**`, `fix/**`, `docs/**`, and on PRs targeting
`main` or `dev`. Concurrency cancels in-flight runs for the same ref so a
fresh push wins the queue.

Three independent jobs:

| Job        | Command                          | Notes |
|------------|----------------------------------|-------|
| `test`     | `uv run pytest -v`               | Checks out submodules recursively; installs `--all-extras --frozen`. |
| `lint`     | `uvx ruff check .` then `uvx ruff format --check .` | No `uv sync` — ruff runs as an ephemeral tool. |
| `typecheck`| `uv run mypy src/lexflow/`       | Installs `--all-extras --frozen`; caches `.mypy_cache/` keyed by `pyproject.toml` + `src/lexflow/**`. |

These three job names (`test`, `lint`, `typecheck`) are the **required
status contexts** referenced from
[`scripts/setup-github.sh`](../../scripts/setup-github.sh) — change them in
both places together.

## `scripts/setup-github.sh`

One-shot script (`bash scripts/setup-github.sh`) that:

1. Applies branch protection to `main` via the GitHub REST API with
   `required_status_checks = { strict: true, contexts: [test, lint, typecheck] }`,
   `allow_force_pushes: false`, `allow_deletions: false`, and
   `required_conversation_resolution: true`.
2. Creates / updates the project label set (`area: api`, `area: graph`,
   `area: chat`, `area: dashboards`, `area: frontend`, `area: core`,
   `area: deps`, `area: ci-cd`, `area: docs`, `area: tests`, `area: data`,
   plus `dependencies` and `do-not-rebase`).

Re-runnable; only updates what changed.

## `labeler.yml` — automatic PR labels

[`.github/workflows/labeler.yml`](../../.github/workflows/labeler.yml) uses
`actions/labeler@v6` with `sync-labels: true`, so labels that no longer
apply (e.g. a follow-up commit drops the only docs file) are **removed**.
The label-to-glob mapping is in
[`.github/labeler.yml`](../../.github/labeler.yml). Every `area:*` label is
applied automatically — PR authors never set them by hand.

The workflow uses `pull_request_target` so it can read repo secrets safely
on PRs from forks; it only needs read access to changed-file metadata.

## `auto-update-prs.yml` — keep PRs rebased

[`.github/workflows/auto-update-prs.yml`](../../.github/workflows/auto-update-prs.yml)
runs on every push to `main` or `dev`. It collects open PRs labelled
`area: deps` or `area: ci-cd` (and not labelled `do-not-rebase`) and calls
the GitHub `update-branch` endpoint on each. This stops dependabot PRs from
piling up behind the `strict: true` branch-protection rule.

`update-branch` returning `422` (already up to date / merge conflict) is
tolerated — one stuck PR never blocks the rest.

## `release-please.yml` — releases

[`.github/workflows/release-please.yml`](../../.github/workflows/release-please.yml)
runs on push to `main`. Two jobs:

- `release-please` — opens/maintains a release PR driven by Conventional
  Commits and updates `.release-please-manifest.json`.
- `publish-wheel` — when a release is created, builds wheel + sdist with
  `uv build` and uploads them to the GitHub release via `gh release upload`.

## `docs.yml` — documentation deploy

[`.github/workflows/docs.yml`](../../.github/workflows/docs.yml) runs on push
to `main` (paths: `docs/**` or the workflow itself) or manual dispatch. It
copies `docs/` into `_site/`, drops a `.nojekyll` marker, injects the current
`pyproject.toml` version in place of `0.1.0`, and force-pushes to
`gh-pages` via `peaceiris/actions-gh-pages@v4`.

## Dependabot — `.github/dependabot.yml`

Three ecosystems:

| Ecosystem        | Schedule              | Labels                              |
|------------------|-----------------------|-------------------------------------|
| `pip`            | weekly, Mon 08:00 CET | `dependencies`, `area: deps`        |
| `github-actions` | monthly               | `dependencies`, `area: ci-cd`       |
| `gitsubmodule`   | weekly, Mon 08:00 CET | `dependencies`, `area: data`        |

Open-PR limits: `pip` 5, `github-actions` 3, `gitsubmodule` 2.

## Branch protection and auto-delete

On `main`:

- Required checks (strict): `test`, `lint`, `typecheck`.
- Required conversation resolution.
- Force pushes disabled, deletions disabled.
- Stale reviews dismissed on new commits.

The repo also has **auto-delete head branches on merge** enabled (set in
GitHub repo settings, not in a file). Feature branches disappear after their
PR merges — see [contributing/git-workflow.md](../contributing/git-workflow.md).
