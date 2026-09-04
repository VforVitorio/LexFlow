# Orca automation — loop watchdog (daily)

Health-check the agent loop itself. Use `gh`.

1. `gh run list --workflow agent-loop.yml --limit 6 --json conclusion,createdAt`.
   If the last 3+ concluded runs all failed, inspect one log: an
   `Error: Invalid API key.` means the OpenCode Go credential died; a failure
   in the guard/claim step means the PAT died (check its expiry). Report
   loudly which credential to rotate (see .github/agent/README.md).
2. If no run exists in the last 24h at all, the workflow may be disabled —
   check `gh workflow list` and report.
3. Orphaned claims: issues labelled `agent:wip` with no run currently in
   progress and no open `agent-pr` PR → a cancelled run leaked the label.
   Remove `agent:wip` from those issues.
4. Sanity: more than one open PR labelled `agent-pr` should be impossible —
   if it happens, report it as a bug in the guard.

End with OK / DEGRADED / DOWN and one line of why.
