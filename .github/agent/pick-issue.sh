#!/usr/bin/env bash
# Picks the next implementable issue for the autonomous agent loop.
#
# Security: only issues authored by the explicit allowlist are eligible —
# this is a public repo and the worker executes with repo-write credentials,
# so a stranger's issue body must never reach the agent. The allowlist is the
# primary filter on purpose (authorAssociation alone is weaker: CONTRIBUTOR
# is granted to anyone with a merged PR).
#
# Outputs (to $GITHUB_OUTPUT): empty=true|false, number, title, branch_prefix,
# model. The issue body is written to $RUNNER_TEMP/issue-body.md — it is data
# for the worker prompt, never evaluated by the shell.
set -euo pipefail

ALLOWED_AUTHORS='["VforVitorio", "Santisoutoo"]'
EXCLUDED_LABELS='["epic", "agent:wip", "agent:blocked", "area: ci-cd", "question", "wontfix", "duplicate", "invalid"]'
MODEL_TOP="opencode-go/kimi-k3"
MODEL_CHEAP="opencode-go/minimax-m3"

fetch_candidates() {
  gh issue list --state open --limit 200 \
    --json number,title,body,labels,author
}

# Filter + sort: allowlisted author, no excluded label, then order by
# priority label (high > medium > low > none), bug before enhancement,
# oldest (lowest number) first.
select_issue() {
  jq --argjson allowed "$ALLOWED_AUTHORS" --argjson excluded "$EXCLUDED_LABELS" '
    map(select(.author.login as $a | $allowed | index($a)))
    | map(select([.labels[].name] as $l | ($excluded | map(. as $e | $l | index($e)) | any) | not))
    | sort_by(
        ([.labels[].name] | if index("priority:high") then 0
                            elif index("priority:medium") then 1
                            elif index("priority:low") then 2
                            else 3 end),
        ([.labels[].name] | if index("bug") then 0 else 1 end),
        .number)
    | .[0] // empty'
}

derive_branch_prefix() {
  local labels="$1"
  if echo "$labels" | jq -e 'index("bug")' >/dev/null; then echo "fix"
  elif echo "$labels" | jq -e 'index("area: docs")' >/dev/null; then echo "docs"
  else echo "feat"
  fi
}

derive_model() {
  local labels="$1"
  if echo "$labels" | jq -e 'index("area: docs") or index("area: tests")' >/dev/null; then
    echo "$MODEL_CHEAP"
  else
    echo "$MODEL_TOP"
  fi
}

main() {
  local issue
  if [[ -n "${FORCED_ISSUE:-}" ]]; then
    # workflow_dispatch override: fetch that one issue, but it must still
    # pass the same author/label filters — never a bypass.
    issue=$(gh issue view "$FORCED_ISSUE" --json number,title,body,labels,author,state \
      | jq --argjson allowed "$ALLOWED_AUTHORS" --argjson excluded "$EXCLUDED_LABELS" '
          select(.state == "OPEN")
          | select(.author.login as $a | $allowed | index($a))
          | select([.labels[].name] as $l | ($excluded | map(. as $e | $l | index($e)) | any) | not)
          // empty')
  else
    issue=$(fetch_candidates | select_issue)
  fi

  if [[ -z "$issue" ]]; then
    echo "No eligible issue found."
    echo "empty=true" >> "$GITHUB_OUTPUT"
    exit 0
  fi

  local number title labels
  number=$(echo "$issue" | jq -r '.number')
  title=$(echo "$issue" | jq -r '.title')
  labels=$(echo "$issue" | jq -c '[.labels[].name]')
  echo "$issue" | jq -r '.body' > "$RUNNER_TEMP/issue-body.md"

  {
    echo "empty=false"
    echo "number=$number"
    echo "title=${title//$'\n'/ }"
    echo "branch_prefix=$(derive_branch_prefix "$labels")"
    echo "model=$(derive_model "$labels")"
  } >> "$GITHUB_OUTPUT"
  echo "Picked #$number ($title)"
}

main "$@"
