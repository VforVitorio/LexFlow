# Troubleshooting

Pitfalls observed in this repo. Add new entries as they appear.

## `data/legalize-es` is empty

**Symptom:** `503 DataUnavailable` from any endpoint, or
`DataPathError: Data directory not found or inaccessible: '.../data/legalize-es'`.

**Cause:** the submodule was not initialised.

**Fix:**
```bash
git submodule update --init --recursive
```

## `.venv` exit code 103 on Windows

**Symptom:** `uv sync` fails with exit code 103, or `uv run` blows up because
`.venv/Scripts/python.exe` points at an interpreter that no longer exists
(typical after uninstalling miniconda).

**Cause:** the launcher on Windows is a stub that references the original
Python install. If that target is gone, the venv is orphaned.

**Fix:**
```powershell
Remove-Item -Recurse -Force .venv
$env:VIRTUAL_ENV = $null      # if it points at an old venv
uv venv --python 3.12
uv sync --all-extras
```

Recorded in [`CLAUDE.md` §11](../../CLAUDE.md) (2026-05-22).

## `mypy: Cannot find implementation or library stub for module 'openai'`

**Cause:** the `typecheck` job — or a local mypy run — installed only the
`dev` extra. `src/lexflow/chat/` imports `openai`, `anthropic`, `google.genai`,
and `src/lexflow/dashboards/` imports `plotly`, all of which live in optional
extras.

**Fix:** install all extras when typechecking.

```bash
uv sync --all-extras --frozen
uv run mypy src/lexflow/
```

CI does this in the `typecheck` job — see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

## `gh api -F restrictions=` returns HTTP 422

When re-running `scripts/setup-github.sh` to reapply branch protection.

**Cause:** the GitHub API expects `null` for restrictions, not `""`.

**Fix:** pass the full payload via stdin as JSON:
```bash
gh api ... --input - < payload.json
```

## Frontend imports from `@/lib/...` fail

**Symptom:** Vite logs `Failed to resolve import "@/lib/store"` (or `queries`,
`api`, `hotkeys`, `utils`).

**Cause:** as of May 2026 the `frontend/src/lib/` directory has not been
committed yet. The page and shell components were generated against a planned
contract documented in [`frontend/README.md`](../../frontend/README.md).

**Workaround:** the work is tracked in the frontend epic. Until those modules
land, the dev server cannot boot end-to-end.

## `git submodule` shows `+abcd1234 data/legalize-es (heads/main)`

**Cause:** the submodule moved upstream. Your local checkout is on an older
commit than the parent repo records.

**Fix:**
```bash
git submodule update --remote --merge
git add data/legalize-es
git commit -m "Update legalize-es submodule"
```

## CI fails on `lint`/`typecheck` after editing only the frontend

The backend CI runs on every push. If the failure is in `ruff format --check`
and you did not touch Python — check that no auto-formatter changed line
endings or whitespace in unrelated files. Reformat:
```bash
uv run ruff format .
```

## CI is green but `gh pr merge --auto` does not merge

`main` requires `test`, `lint`, `typecheck` (see [`CLAUDE.md` §9](../../CLAUDE.md))
**and** all conversations resolved. Re-check the PR page for unresolved threads.
