#!/usr/bin/env bash
# Configure LexFlow's GitHub repo: branch protection on main + labels used
# by the labeler / dependabot / auto-update-prs workflows.
#
# Idempotent: re-running only updates what has changed. Requires `gh auth login`.
#
# Usage:  bash scripts/setup-github.sh
#
# --- WHERE TO CHANGE IF X CHANGES ---
# Required CI contexts on main           → PROTECTION_PAYLOAD below
# Label set (labeler.yml, dependabot.yml,
#            auto-update-prs.yml)        → LABELS array below

set -euo pipefail

REPO="${GH_REPO:-VforVitorio/LexFlow}"

# The REST API rejects -F restrictions= (empty string), so we pass the
# whole payload as JSON via --input -. Keep contexts in sync with
# .github/workflows/ci.yml job names (test / lint / typecheck / frontend-build).
#
# strict=false ("require branches up to date before merging" = OFF): with a
# fast, sequential, small-PR solo flow, strict=true forced a manual "Update
# branch" rebase on every PR whenever main advanced (release-please bumps,
# back-to-back merges), which auto-merge can't do on its own. Turning it off
# lets auto-merge land PRs the moment their required checks are green. The
# checks still ran on the PR's own commit; the only thing dropped is the
# re-validation of the exact merge — acceptable here, revisit (merge queue)
# if concurrent conflicting PRs become common. (2026-06-11)
read -r -d '' PROTECTION_PAYLOAD <<'JSON' || true
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["test", "lint", "typecheck", "frontend-build"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON

echo "==> Protecting main on ${REPO}"
printf '%s' "$PROTECTION_PAYLOAD" | gh api -X PUT \
  "repos/${REPO}/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  --input - --silent
echo "    ok"

# Label name → "color|description". Colors are hex without '#'.
LABELS=(
  "dependencies|0366d6|Pull requests that update a dependency file"
  "do-not-rebase|b60205|Tell auto-update-prs to leave this PR alone"
  "area: codebase|1d76db|Touches src/, scripts/ or main.py"
  "area: api|0052cc|FastAPI endpoints / api layer"
  "area: graph|5319e7|Knowledge graph (NetworkX)"
  "area: chat|0e8a16|Chatbot / MCP tools"
  "area: dashboards|fbca04|Plotly / analytics views"
  "area: frontend|d93f0b|Reflex pages and components"
  "area: core|c5def5|Domain models, parsers, business logic"
  "area: deps|cfd3d7|Dependency bumps (pyproject.toml, uv.lock)"
  "area: ci-cd|ededed|GitHub Actions / workflows / dependabot"
  "area: docs|0075ca|Documentation only"
  "area: tests|bfd4f2|Tests only"
  "area: data|fef2c0|legalize-es submodule / data files"
)

echo "==> Ensuring labels exist on ${REPO}"
for spec in "${LABELS[@]}"; do
  name="${spec%%|*}"
  rest="${spec#*|}"
  color="${rest%%|*}"
  desc="${rest#*|}"
  if gh label create "$name" --color "$color" --description "$desc" --repo "$REPO" 2>/dev/null; then
    echo "    created : $name"
  else
    gh label edit "$name" --color "$color" --description "$desc" --repo "$REPO" >/dev/null
    echo "    updated : $name"
  fi
done

echo
echo "Done. Verify with:"
echo "  gh api repos/${REPO}/branches/main/protection | jq ."
echo "  gh label list --repo ${REPO}"
