# Git Workflow

LexFlow uses a two-trunk model with feature branches off `dev`. The shape is
fixed; the rules below are enforced by branch protection
([operations/ci-cd.md](../operations/ci-cd.md)) and CI.

## Branches

| Branch     | Purpose | How it advances |
|------------|---------|-----------------|
| `main`     | Stable, protected. The source of releases. | **Only** through PRs from `dev`. |
| `dev`      | Integration trunk. All ongoing work converges here. | Through PRs from `feat/*`, `fix/*`, `docs/*`. |
| `feat/<name>` | New feature.            | Branched from `dev`, merged back into `dev`. |
| `fix/<name>`  | Bug fix.                | Branched from `dev`, merged back into `dev`. |
| `docs/<name>` | Docs-only change.       | Branched from `dev`, merged back into `dev`. |

Use kebab-case for the suffix (`feat/test-infra`, `fix/empty-submodule`,
`docs/api-client`).

## Lifecycle

```
main ─────────────────────●────────────────────●─────►
                          ↑                    ↑
dev  ──●──●──●──●──●──●──●●──●──●──●──●──●──●──●─────►
        ↑     ↑           ↑     ↑
        feat/explorer     fix/sync-race
```

1. `git switch dev && git pull`.
2. `git switch -c feat/your-thing`.
3. Commit. Push. Open a PR **to `dev`**.
4. CI runs `test`, `lint`, `typecheck` — all three must be green.
5. PR merges. Branch is auto-deleted by GitHub (see below).
6. Periodically a maintainer opens a PR `dev → main` to cut a release.

Never branch from `main` directly. Never merge a feature branch into `main`.

## No squash merges

Squashing destroys the per-step history that makes bisect, blame, and review
useful. LexFlow keeps the full history:

- **Allowed merge methods:** merge commit, rebase-and-merge.
- **Disallowed:** squash merge.

Keep your branch tidy *before* opening the PR — `git rebase -i` against `dev`
to clean up WIP commits. The history that lands on `dev` is the history that
stays.

## Auto-delete on merge

GitHub's "Automatically delete head branches" is enabled on the repo. Once a
PR merges, the feature branch is removed from the remote. Pull `dev` and
prune your local tracking refs:

```bash
git switch dev && git pull
git fetch --prune
```

## Commit messages

- **English**, **imperative mood** — "Add diff route", not "Added diff
  route" or "Adds diff route".
- One logical change per commit; the body explains *why* if the subject
  doesn't.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`, `ci:`) are honoured by release-please on `main` and drive
  automatic version bumps — see
  [operations/ci-cd.md](../operations/ci-cd.md#release-pleaseyml--releases).

Example:

```
feat(api): add /laws/{id}/diff endpoint

Returns the unified-diff text plus per-article stats between two commits
on the legalize-es repo. Powers the frontend DiffPage.
```

## Forbidden

- **Force-pushing to `main` or `dev`.** Branch protection rejects this.
- **Skipping hooks** (`--no-verify`, `--no-gpg-sign`). If a hook fails, fix
  the underlying issue and commit again.
- **Squash-merging.** See above.
- **Branching from `main`.** Always branch from up-to-date `dev`.

## When in doubt

[CONTRIBUTING.md](../../CONTRIBUTING.md) at the repo root has the same rules
in Spanish, plus the PR checklist. The PR mechanics live in
[pull-requests.md](./pull-requests.md).
