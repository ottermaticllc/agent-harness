# How every Codex call runs

Checked against Codex CLI 0.163.0 (`codex help exec`, `codex help exec resume`).
Run `codex help exec` on your version if a flag is refused.

## Rules for every call

- **Prompt from a file, on stdin.** Write `$RUN/prompt-<name>.md` with your file
  tool or a quoted heredoc (`<<'EOF'`), append the plan with `cat >>`, and pass
  `-` so Codex reads stdin. Text inside a double-quoted shell argument is
  expanded by your shell first: a plan step containing `` `npm run db:migrate` ``
  would run on your machine, outside any sandbox. Stdin from a file also stops
  `codex exec` from waiting for input.
- **One reply file per call:** `-o "$RUN/codex-<name>.md"`. A shared file could
  show an old `APPROVE` after a failed call.
- **Same model every call.** If you pick a model, pass `-m "$MODEL"` on every
  call, resumes included, and log it. Otherwise Codex uses its configured
  default; log which one that was.
- **Lock the sandbox from the command line**, so a wider setting in the user's
  Codex config cannot loosen it:
  - Review calls: `--sandbox read-only --disable plugins --disable apps`, plus
    `-c 'mcp_servers.<NAME>.enabled=false'` for each server that
    `codex mcp list --json` (run in `ROOT`) shows. Read-only blocks file
    writes, not side effects of MCP tools.
  - Build calls: `--sandbox workspace-write -c sandbox_workspace_write.network_access=false -c 'sandbox_workspace_write.writable_roots=[]'`.
    Codex can then write only in `ROOT` and temp folders, with no network.
- **Never** use `--dangerously-bypass-approvals-and-sandbox`. It removes the
  sandbox that makes the per-step gate safe.
- **Session flags go before `resume`.** `codex exec resume` has no `--sandbox`
  or `-C` of its own. Put them on `codex exec`, then `resume <id> -`. A test on
  0.163.0 confirmed a resumed session given `--sandbox read-only` this way could
  not write a file.

## Commands

Fresh review (starts the session):

```bash
codex exec --json --sandbox read-only -C "$ROOT" -o "$RUN/codex-r1.md" \
  --disable plugins --disable apps -c model_reasoning_effort=high [-m "$MODEL"] \
  [-c 'mcp_servers.NAME.enabled=false' ...] \
  - < "$RUN/prompt-r1.md" > "$RUN/codex-r1.jsonl"

jq -r 'select(.type=="thread.started") | .thread_id' "$RUN/codex-r1.jsonl" \
  | head -1 > "$RUN/codex-session-id"
```

Review turn K (resume by saved id):

```bash
codex exec --json --sandbox read-only -C "$ROOT" -o "$RUN/codex-r<K>.md" \
  --disable plugins --disable apps -c model_reasoning_effort=high [-m "$MODEL"] \
  resume "$(cat "$RUN/codex-session-id")" - < "$RUN/prompt-r<K>.md" > "$RUN/codex-r<K>.jsonl"
```

Build step N (resume, write access):

```bash
codex exec --json --sandbox workspace-write -C "$ROOT" -o "$RUN/codex-step<N>.md" \
  -c sandbox_workspace_write.network_access=false -c 'sandbox_workspace_write.writable_roots=[]' \
  -c model_reasoning_effort=high [-m "$MODEL"] \
  resume "$(cat "$RUN/codex-session-id")" - < "$RUN/prompt-step<N>.md" > "$RUN/codex-step<N>.jsonl"
```

`$(cat "$RUN/codex-session-id")` is safe: it only inserts the id Codex itself
printed. Always resume by that id, never `--last`; with several sessions open,
`--last` can pick up a different conversation.

## Background, deadline, clean stop

Run each call in the background as its own process group so it can be stopped
cleanly (`perl` ships with macOS and most Linux systems):

```bash
sh -c 'echo $$ > "$0"; exec perl -e "setpgrp(0,0); exec @ARGV or die" -- "$@"' \
  "$RUN/codex-<name>.pid" codex exec ... - < "$RUN/prompt-<name>.md" > "$RUN/codex-<name>.jsonl"
```

Deadlines: 10 minutes for reviews; for a build step, the longest command the
plan says that step runs. A `.jsonl` that stops growing is only a warning; a
long silent test is normal. On deadline: `kill -TERM -- -$(cat <pid file>)`,
check `pgrep -g <pgid>` finds nothing, and treat it as a failed turn.

Codex is slow: 1 to 5 minutes per call is normal. Wait; don't spin.

## Valid-turn check (every call, before trusting anything)

- the `.jsonl` has a `turn.completed` event and no `error` or `turn.failed` event;
- the reply file is not empty;
- for reviews: the first line (ignoring spaces and `*`) is exactly `APPROVE`,
  `REVISE` or `BLOCKED`, and the reply ends with `Checked:` and `Limits:` lines.

Anything else (deadline, crash, empty reply, verdict buried in prose) is a
**failed turn, never an approval**. A failed review is retried once in the same
session; if it fails again, stop and tell the user. If both failures were
deadline hits, you may switch to a different model first; that is a new session,
seeded from `plan.md` and `review-log.md`, with its new id saved. A failed turn
does not count toward the turn cap.

## Effort

`model_reasoning_effort=high` is the default here. Raise it to `xhigh` only when a
review comes back shallow on a genuinely hard problem.
