# Autonomous agent loop — runbook

The `agent-loop` workflow (`.github/workflows/agent-loop.yml`) picks one open
issue three times a day, implements it with an OpenCode worker (OpenCode Go
models), has a second agent review the diff, verifies the full CI surface,
opens a PR and arms auto-merge. Orca (desktop, on the maintainer's machine)
supervises: daily report, stuck-PR detector, watchdog (prompts under
`.github/agent/orca/`).

## Files

| File | Role |
|---|---|
| `worker-prompt.md` | System prompt for the implementer agent |
| `reviewer-prompt.md` | System prompt for the pre-PR reviewer agent |
| `pick-issue.sh` | Issue picker: author allowlist, label filters, model routing |
| `opencode.json` | OpenCode config for CI (no MCPs, headless permissions) |
| `orca/` | Prompts for the local Orca supervision automations |

## One-time setup (repo admin only)

1. **`AGENT_GH_PAT`** (Actions secret): fine-grained PAT restricted to this
   repo with Read+Write on **Contents, Pull requests, Issues** and NO
   Workflows scope (deliberate: the loop must be unable to rewrite itself,
   even under prompt injection). Note the expiry date below. The default
   `GITHUB_TOKEN` cannot be used: PRs it creates never trigger the required
   `pull_request` checks, so auto-merge would never fire.
2. **`OPENCODE_AUTH_JSON`** (Actions secret): base64 of an `auth.json`
   holding a valid OpenCode Go API key. Generate from a machine where
   `opencode` is logged in:

   ```bash
   base64 -w0 ~/.local/share/opencode/auth.json
   ```

   (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.local\share\opencode\auth.json"))`)
3. Run `scripts/setup-github.sh` (or `gh label create`) so the labels
   `agent-pr`, `agent:wip`, `agent:failed`, `agent:blocked` exist.

Until both secrets exist the workflow runs but disarms itself at the first
step (no failures, no noise).

## Credential rotation

| Credential | Expires | Symptom when dead | Fix |
|---|---|---|---|
| `AGENT_GH_PAT` | PAT expiry date (max 1 year) | every run fails at the guard/claim step | regenerate PAT, update secret |
| `OPENCODE_AUTH_JSON` | Go subscription lapse / key rotation | `Error: Invalid API key.` in the implement step | re-login locally, regenerate base64, update secret |

## State machine (labels)

- `agent:wip` — claimed by a running job. Orphaned `wip` (no run in progress,
  no open PR) means a cancelled run; the Orca watchdog clears it.
- `agent:failed` — one failed attempt; the picker will retry it.
- `agent:blocked` — two failed attempts; the picker skips it until a human
  removes the label or closes the issue.
- `agent-pr` — on every loop PR. Only one may be open at a time (branch
  protection runs `strict:false`); a red agent PR therefore PAUSES the loop
  until it is closed or fixed — that is intentional fail-safe behaviour.

## Pause / resume

- Pause: `gh workflow disable agent-loop` (or delete the secrets).
- Resume: `gh workflow enable agent-loop`.
- One-shot manual run: `gh workflow run agent-loop -f issue=<N>` (the forced
  issue still passes the author/label safety filters).

## Manual rescue of `agent:blocked`

1. Open the repo in Orca (or a terminal), create a branch `fix/...`.
2. Run `opencode` interactively with `.github/agent/worker-prompt.md` as the
   opening prompt plus the issue text, or just fix it by hand.
3. Open a normal PR; remove `agent:blocked` (or let `closes #N` end it).

## Security model

- Only issues authored by the allowlist in `pick-issue.sh` are eligible —
  stranger-filed issues on this public repo never reach the worker.
- Issue bodies are passed to the agents as data with explicit
  ignore-embedded-instructions framing; issue comments are never passed.
- The checkout uses `persist-credentials: false`; the PAT exists only in the
  env of steps that talk to GitHub, never in the implement/verify steps.
- The PAT has no Workflows scope, so a push touching `.github/workflows/` is
  rejected by GitHub itself; `area: ci-cd` issues are excluded by the picker
  for the same reason.
