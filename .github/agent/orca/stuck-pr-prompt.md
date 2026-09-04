# Orca automation — stuck/red agent PR detector (every 4h)

An open PR labelled `agent-pr` blocks the whole loop (one-in-flight guard),
so a red or stalled one must be dealt with quickly. Use `gh`.

1. `gh pr list --state open --label agent-pr` — if empty, stop.
2. For each PR: `gh pr checks <n>`. If all green and auto-merge armed, it is
   about to land — stop, all good.
3. If checks are RED: diagnose from the failing job log (`gh run view
   --log-failed`). Then:
   - Flaky/transient (network, runner)? → `gh run rerun <id> --failed`.
   - Real code failure? → comment a one-paragraph diagnosis on the PR
     (plain `gh pr comment`, NEVER an inline review thread — conversation
     resolution would deadlock the merge), then close it with
     `gh pr close <n> --delete-branch` and add `agent:failed` to the linked
     issue so the picker's attempt accounting stays truthful.
4. If checks have been pending > 2h with no activity, comment the anomaly on
   the PR and report it.
