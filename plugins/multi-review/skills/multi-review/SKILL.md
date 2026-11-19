---
name: multi-review
description: Runs independent code reviewers from different model families (the host agent or a fresh subagent, Codex CLI, and Gemini through the Antigravity CLI `agy`) on the same change in parallel, then combines them into one SHIP / SHIP WITH AMENDMENTS / DO NOT SHIP verdict. Use when the user asks for a multi-review, a second or third opinion, "have codex/gemini review this", or a pre-merge or pre-deploy check of a non-trivial change.
license: MIT
---

# Multi-review

Several reviewers look at the same change without seeing each other's work.
Then you, the host agent, check the disputed findings against the code and give
one verdict. Different model families miss different things, so the value is in
the disagreements as much as the agreements.

You never push, merge or deploy. The user acts on the verdict.

## When not to use it

Skip it, and say so in one line, for typos, formatting, comment or doc-only
edits, one-line fixes that are plainly right, and throwaway branches. Use it for
multi-file changes, schema or migration changes, auth, payments, build or deploy
config, and anything that touches production data.

## Before you start: what leaves the machine

The diff (and any file a reviewer chooses to read) is sent to OpenAI when Codex
runs and to Google when `agy` runs. If the code must not go to those providers,
run with the inside reviewer only and say it is a single-model review.

## Step 0 - Pick the reviewers

Run `command -v codex` and `command -v agy`. Then build the roster:

| Reviewer | Use it when | How |
|---|---|---|
| Inside reviewer | always | A fresh subagent if your harness has them (Claude Code: the Agent tool). Otherwise you review it yourself, under the independence rule below. |
| Codex | `codex` is installed AND you are not Codex | `codex exec`, read-only sandbox (Step 3) |
| Gemini | `agy` is installed | `agy -p` (Step 3) |

- If you are Codex, Codex is already the inside reviewer. Do not also call
  `codex exec`; that would be the same model family twice.
- For each missing CLI, tell the user: "Skipping <name>: <cli> not found."
- If no outside reviewer is left, continue, but label the result
  **single-model review** in the verdict and say why.
- The user can drop reviewers (`skip-codex`, `skip-gemini`) or name a model.

## Step 1 - Capture the change

Make a run folder outside the repo so nothing ends up in git:

```bash
ROOT=$(git rev-parse --show-toplevel)
RUN=$(mktemp -d "${TMPDIR:-/tmp}/multi-review-XXXX")
```

Save the diff for the target:

| Target | Command |
|---|---|
| uncommitted (default) | `git diff HEAD > "$RUN/diff.patch"` plus `git ls-files --others --exclude-standard` (read new files in full; `git diff` does not show them) |
| a commit | `git show <sha> > "$RUN/diff.patch"` |
| a branch | `git diff <base>...<branch> > "$RUN/diff.patch"` (ask for the base if it is not obvious) |
| a pull request | `gh pr diff <number> > "$RUN/diff.patch"` |
| a diff file | `cp <path> "$RUN/diff.patch"` |

If the target is unclear ("review my last commit"), resolve it
(`git log --oneline -1`) and state what you picked. Record the repo state so you
can prove reviewers changed nothing: `git status --porcelain > "$RUN/status-before.txt"`.

## Step 2 - Write one prompt for everyone

Copy the template in `references/reviewer-prompt.md` into `$RUN/prompt.md`, fill
in the brackets, then:

```bash
cat "$RUN/diff.patch" >> "$RUN/prompt.md"
echo '--- DIFF END ---' >> "$RUN/prompt.md"
```

Every reviewer gets this same file. Write prompts with your file tool or a quoted
heredoc (`<<'EOF'`), never inside a double-quoted shell string: a diff that
contains `$(...)` or backticks would run on your machine.

## Step 3 - Run the reviewers in parallel

Start the outside reviewers in the background first, then the inside reviewer.

**Codex** (read-only sandbox; it can read the repo to check callers, but cannot
write; `--ephemeral` keeps the session out of your Codex history):

```bash
codex exec --sandbox read-only --ephemeral --json \
  --disable plugins --disable apps -C "$ROOT" \
  -o "$RUN/codex.md" - < "$RUN/prompt.md" > "$RUN/codex.jsonl" 2> "$RUN/codex.err"
```

Add `-m <model>` to pick a model; otherwise Codex uses your configured default.
Read-only stops file writes, not side effects of MCP tools; if you have MCP
servers configured (`codex mcp list`), add `-c 'mcp_servers.<NAME>.enabled=false'`
for each.

**Gemini through agy**:

```bash
agy -p "$(cat "$RUN/prompt.md")" --mode plan --print-timeout 600s < /dev/null \
  > "$RUN/gemini.md" 2> "$RUN/gemini.err"
```

- `agy models` lists model ids; pass one with `--model <id>` if you want a
  specific one.
- `--mode plan` keeps agy from editing; Step 4 still checks the repo afterwards.
  The diff is already inside the prompt, so agy needs no tools. In print mode it
  cannot ask for permission: if it tries to run a command it stops with "no
  output produced ... auto-denied". If that happens, the prompt was missing
  something; do not add `--dangerously-skip-permissions`.
- agy sometimes says it wrote a file without doing it. Use its stdout as the
  review, never a file it claims to have made.
- Very large diffs can exceed the shell's argument limit. If so, skip the
  Gemini reviewer and say why, rather than granting agy tool permissions.

**Inside reviewer.** With subagents: start one fresh subagent (the strongest
model you can afford), give it the path to `$RUN/prompt.md`, tell it to read the
repo but change nothing, and to write its reply to `$RUN/inside.md`. Do not pass
it your own opinion of the change.

Without subagents, review it yourself **before you open any outside report**:
follow `$RUN/prompt.md` and save your reply to `$RUN/inside.md` first. This is
the independence rule: no reviewer, you included, sees another's findings before
synthesis.

Give each outside reviewer a 10-minute deadline. One that times out or fails is
dropped and named in the verdict; it is never counted as approval.

## Step 4 - Check each reply

A reply counts only if:
- the file is not empty, and its first line (ignoring spaces and `*`) is exactly
  `SHIP`, `SHIP WITH AMENDMENTS` or `DO NOT SHIP`;
- for Codex, `codex.jsonl` has a `turn.completed` event and no `turn.failed` or
  `error` event.

Then confirm the reviewers left the repo alone:
`git status --porcelain | diff - "$RUN/status-before.txt"`. If anything changed,
stop and show the user before doing anything else.

## Step 5 - Combine

Now read all replies. For every finding that only one reviewer raised, or that
reviewers disagree on, open the code and check it yourself. Mark it confirmed or
false positive, with the file and line as evidence.

Verdict rule: the most cautious verdict among valid replies wins, unless the
finding behind it is shown false in the code.

Write `$RUN/synthesis.md` and show it to the user:

```markdown
# Multi-review - <target> - <date>
Reviewers: inside (<model>), Codex (<model>), Gemini (<model>)  [or: single-model review - <why>]
Skipped: <reviewer: reason>

## Verdict
SHIP | SHIP WITH AMENDMENTS | DO NOT SHIP

## Raised by more than one reviewer
- [severity] file:line - issue (who)

## Raised by one reviewer
- [severity] file:line - issue (who) - confirmed | false positive: <evidence>

## What to change before shipping
1. ...   (or "Nothing blocking.")

Raw replies: $RUN/inside.md, $RUN/codex.md, $RUN/gemini.md
```

Keep the raw replies; do not delete them after synthesis. Tell the user the run
folder path.

## Options the user can give

- `focus:<areas>` - put the areas in the prompt's focus line.
- `critical-only` - leave Medium and Low out of the synthesis (keep them in the raw files).
- `skip-codex`, `skip-gemini`, `skip-inside` - drop a reviewer. Dropping all
  outside reviewers makes it a single-model review.

## Cost

One call per reviewer, plus your own synthesis. Codex and agy bill against
whatever plan those CLIs are signed in to. A small diff usually takes 1 to 5
minutes per outside reviewer. For a large change, use a cheaper model for the
inside reviewer and say so in the synthesis.
