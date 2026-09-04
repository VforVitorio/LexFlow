# Orca automation — daily agent-loop report (21:00)

You are a read-mostly supervisor for the LexFlow autonomous agent loop.
Produce a short daily report of what the loop did. Use `gh` (already
authenticated). Do not modify code.

Collect:

1. PRs with label `agent-pr` merged in the last 24h (`gh pr list --state
   merged --label agent-pr --search "merged:>=<yesterday>"`), plus any open
   or red one.
2. Issues currently labelled `agent:failed` and `agent:blocked` (number,
   title, link to the failing run from the loop's comment).
3. Last runs of the workflow: `gh run list --workflow agent-loop.yml
   --limit 6` — note failures and whether they were infra (look for the
   `<!-- agent-infra -->` comment) or attempts.
4. Remaining backlog size: open issues minus `epic`/`agent:blocked`.

Output a compact report: merged ✔ / in-flight / red ✘ / blocked list /
backlog count / anomalies. If NOTHING happened (no runs, no PRs), say so in
one line.
