# Git Workflow

LexFlow uses **trunk-based development** (since 2026-05-30). `main` is the
only long-lived branch. Feature branches come off `main` and PR back to `main`
directly. The old `dev` integration branch was retired and no longer exists on
the remote.

Branch protection is enforced by CI
([operations/ci-cd.md](../operations/ci-cd.md)).

## Branches

| Branch     | Purpose | How it advances |
|------------|---------|-----------------|
| `main`     | Protected. The only long-lived branch; source of releases. | Through PRs from `feat/*`, `fix/*`, `docs/*`. |
| `feat/<name>` | New feature.            | Branched from `main`, merged back into `main`. |
| `fix/<name>`  | Bug fix.                | Branched from `main`, merged back into `main`. |
| `docs/<name>` | Docs-only change.       | Branched from `main`, merged back into `main`. |

Use kebab-case for the suffix (`feat/test-infra`, `fix/empty-submodule`,
`docs/api-client`).

## Lifecycle

```
main ──●──●──●──●──●──●──●──●──●──●─────►
        ↑     ↑           ↑     ↑
        feat/explorer     fix/sync-race
```

1. `git switch main && git pull`.
2. `git switch -c feat/your-thing`.
3. Commit. Push. Open a PR **to `main`**.
4. CI runs `test`, `lint`, `typecheck` — all three must be green.
5. PR merges. Branch is auto-deleted by GitHub (see below).

Never merge a feature branch into `main` directly without a PR.

## No squash merges

Squashing destroys the per-step history that makes bisect, blame, and review
useful. LexFlow keeps the full history:

- **Allowed merge methods:** merge commit, rebase-and-merge.
- **Disallowed:** squash merge.

Keep your branch tidy *before* opening the PR — `git rebase -i` against `main`
to clean up WIP commits. The history that lands on `main` is the history that
stays.

## Auto-delete on merge

GitHub's "Automatically delete head branches" is enabled on the repo. Once a
PR merges, the feature branch is removed from the remote. Pull `main` and
prune your local tracking refs:

```bash
git switch main && git pull
git fetch --prune
```

## Commit messages

- **English**, **imperative mood** — "Add diff route", not "Added diff
  route" or "Adds diff route".
- One logical change per commit; the body explains *why* if the subject
  doesn't.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`, `ci:`) are honoured by release-please and drive automatic
  version bumps — see
  [operations/ci-cd.md](../operations/ci-cd.md#release-pleaseyml--releases).

Example:

```
feat(api): add /laws/{id}/diff endpoint

Returns the unified-diff text plus per-article stats between two commits
on the legalize-es repo. Powers the frontend DiffPage.
```

## Forbidden

- **Force-pushing to `main`.** Branch protection rejects this.
- **Skipping hooks** (`--no-verify`, `--no-gpg-sign`). If a hook fails, fix
  the underlying issue and commit again.
- **Squash-merging.** See above.
- **Branching from `main` to push directly** — use a PR. The only exception
  is a maintainer emergency fix with explicit conversation resolution.

## When in doubt

[CONTRIBUTING.md](../../CONTRIBUTING.md) at the repo root has the same rules
in Spanish, plus the PR checklist. The PR mechanics live in
[pull-requests.md](./pull-requests.md).
