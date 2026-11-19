---
name: codex-loop
description: A heavyweight plan-review-build loop for risky multi-step coding work. A fresh planner drafts the plan, Codex CLI attacks it until you agree, the user approves, then Codex builds it one step at a time while you check each step's proof, and a model that did not write the code does the final check. Use when the user asks for codex-loop or says "plan it, have Codex review it, then build it", for schema, auth, payments, production config or a "which approach?" fork. Not for anything you could finish in about 15 minutes.
license: MIT
disable-model-invocation: true
---

# codex-loop

> **Permission gate.** Never start this loop without the user's explicit go-ahead
> for this specific task. If you got here on your own rather than because the user
> asked, stop and ask first. The loop spends real Codex time and edits files.
> (In Claude Code, `disable-model-invocation: true` above means only the user can
> start it with `/codex-loop`. Other agents may ignore that field, so the rule
> here still applies.)

## What this is

One task, four phases:

1. **Plan:** a fresh subagent drafts a step-by-step plan in a clean context.
2. **Agree:** Codex reviews the plan, then you argue its objections to consensus
   over at most 3 turns. **Gate 1:** the user approves the final plan.
3. **Execute:** coding steps go to Codex, resuming the same session that shaped
   the plan. Non-coding steps go to a subagent. Steps that need network,
   credentials or production you run yourself, after the user's OK.
   **Gate 2:** you review every step and run its proof before the next one.
4. **Final check:** a model that did not write the code checks the result.

You are the orchestrator throughout. Only you talk to the user, start
subagents and call Codex. Codex runs in its own sandbox and cannot start your
subagents; every research request goes through you.

**Harness notes.** Subagents are a Claude Code feature (the Agent tool). In an
agent without them, do the planning and non-coding steps yourself and say that
the plan was not drafted in a separate context. This loop calls Codex as an
outside model. If you *are* Codex, the review is no longer a second model family;
suggest the `multi-review` skill (or another reviewer CLI) instead, or run the loop
knowing that.

**Needs:** Codex CLI (signed in), `git`, `jq`, `perl`.

## When not to use it

The loop costs a planner run, a Codex review plus up to 3 argument turns, two
human gates, a review per step and a final check. That pays off only when a
wrong turn is expensive. Skip it and say so in one line for a typo, a rename, a
single-file edit, routine CRUD, a quick lookup, throwaway work, or anything you
would finish in under about 15 minutes:

> "This is small enough that the loop would cost more than the task, so I'll
> just do it. Say 'force the loop' if you want the full cycle anyway."

Worth it for: changes that are hard to undo (schema, auth, payments,
production, credentials, customer data), a real "which architecture?" choice
where the wrong pick means a rewrite, and long builds where small drift adds up.

## Phase 0 - Setup

1. **Run folder:** `RUN=$(mktemp -d "${TMPDIR:-/tmp}/codex-loop-XXXX")`. It is
   unique per run and outside the project, so runs can't collide and Codex can't
   edit the plan or leak logs into git. Write the task, verbatim, to
   `$RUN/task.md`. Tell the user the path so a later session can pick it up.
2. **Pick the checkout.** Ask once: "Is any other session working in this repo
   during this task?"
   - Yes or unsure: create a git worktree; its absolute root is `ROOT`.
   - No: `ROOT=$(git rev-parse --show-toplevel)`. Every file the plan touches
     must start clean.
3. **Check `ROOT`.** It must be a git repo with at least one commit, and not a
   folder that holds many unrelated projects. `--skip-git-repo-check` is allowed
   only for reviewing non-git material, never for a build.
4. **Pick the Codex model** once (or use the configured default) and log it.

Everything after this uses `ROOT`. If the checkout changes after an `APPROVE`,
the approval is void: send the full plan back for review against the new root.

## Phase 1 - Plan

Start one fresh subagent (the strongest model available) with the planner prompt
in `references/prompts.md`, pointed at `ROOT`. Fresh context keeps your earlier
chatter from shaping the plan. The plan must be:

- numbered, concrete steps, each reviewable on its own;
- each step with its files, a done-condition and a **proof**: an exact command
  and its expected result (plus a time limit if long); one final proof for the
  whole task;
- steps needing network, credentials, installs, real database migrations or
  live settings tagged `[orchestrator]` (Codex's sandbox would block them);
- adjacent trivial steps may be marked `[batch]`;
- open questions and assumptions at the end. These seed the review.

Save it as `$RUN/plan.md`.

## How Codex is called

Read `references/codex-commands.md` before the first call. In short: prompts go
to a file and in on stdin, one reply file per call, read-only sandbox for
reviews, workspace-write with no network for builds, flags before `resume`,
always resume by the saved session id, run in the background with a deadline,
and apply the valid-turn check to every reply.

## Phase 2 - Agree

One Codex session spans this phase and the build, so Codex builds the plan it
helped shape.

**Round 1.** Write `$RUN/prompt-r1.md` from the round-1 template, append the
plan, run the fresh review and save the session id from the `thread.started`
event to `$RUN/codex-session-id`.

**Reading the verdict:**
- `APPROVE` with an unresolved high or medium objection counts as `REVISE`.
- Clean `APPROVE`: go to Gate 1.
- `BLOCKED`: give Codex what it is missing on the next turn. If you can't, stop
  and tell the user. `BLOCKED` is never approval.
- `REVISE`: you now have a numbered list. The rest of this phase is an
  **argument, not a re-plan.**

**Argue to consensus.** Sort the objections:
- **Accept:** a real correctness, safety or quality gap. Fold it into `plan.md`.
- **Push back:** nitpicky, stylistic, over-engineered, or wrong given context you
  have. Leave the plan and say why.

Reply in the same session with the turn-K template: what you took, what you
reject and why, and the **full current plan**, never only the changed part. A
fix to one step can break another, and Codex only catches that if it re-reads
everything.

- You are allowed to win. Codex output is a hypothesis, not ground truth. Weigh
  every objection honestly, and be suspicious of a quick concession: if Codex
  gives in without engaging your reasoning, ask once whether the objection holds.
- **Approval covers only the plan Codex saw.** Any edit after `APPROVE`,
  including changes the user asks for at Gate 1, voids it: one more full-plan turn.
- **Research.** If Codex writes `RESEARCH:` or you need facts, batch the
  questions and ask the user: "We want to research these N things before
  finalizing: [list]. Approve, trim or skip?" On approval, run one subagent per
  question in parallel (or research yourself without subagents), save each
  cited finding to `$RUN/research/<slug>.md`, and pass them to Codex on the next
  turn. Mark low-confidence findings; never pass them on as fact.
- **Turn cap: 3** argument turns after round 1. Still no consensus: stop. Give
  the user the plan and each open disagreement (each side in one line); they
  force-approve, redirect or abort. Log a force-approve as "user override, not
  Codex-approved".
- Log every turn in `$RUN/review-log.md`: objections, what you took, what you
  rejected, Codex's reply, the model.

**Gate 1.** Show the user the final `plan.md`, the review summary (including any
remaining disagreement) and every `[orchestrator]` step. Wait for an explicit
go or no-go before touching anything.

## Phase 3 - Execute

Before step 1, write `$RUN/base.txt` with `git rev-parse HEAD` and
`git status --porcelain --untracked-files=all`. Files dirty before the run are
not this run's work.

Build **one step at a time**, routed by type:

- **Coding** (source, config, tests, scripts, a build) → Codex, resuming the
  saved session with write access (build-step template and command).
- **Non-coding** (docs, copy, research, analysis) → a subagent scoped to that
  step, pointed at `ROOT` and `plan.md`. Don't spend Codex on prose.
- **`[orchestrator]`** (network, credentials, installs, real migrations, live
  settings) → you, only after the user's explicit OK for that step.

All three work in `ROOT`, so Codex sees what others left on disk. If a non-Codex
step changes an assumption Codex relies on, say so in one line on the next resume.

**Failed build turn: never retry blindly.** A half-run step (part of a data
change, say) could run twice. Stop the process group, confirm nothing is still
running, look at what partly changed (files and any outside state), then resume
Codex for only the unfinished part.

**After each step:**
1. Log the step's files in `review-log.md`, each with its author (Codex, a
   subagent, you): every path the step names, plus any new path in
   `git status --porcelain --untracked-files=all`. This list defines what the
   run touched.
2. In a shared checkout, confirm `HEAD` has not moved since `base.txt`. If it
   has, stop: another session is working here. Tell the user.
3. Review the actual changes (`git diff`, and read new files in full), not the
   self-report.
4. **Run the step's proof yourself** and log the output. Codex's sandbox often
   blocks tests, so "looks done" is not proof.
5. Clean and proof passes: next step.
6. Wrong, drifted or proof fails: resume Codex with a correction for the same
   step (correction template), then re-run the proof. At most **2 corrections
   per step**; then stop and tell the user.

When all steps pass, run the final proof and log its output.

## Phase 4 - Final check

Your step reviews watched the build, so they are not independent. One check by
a model that did not write the code, in a fresh context:

- Code Codex wrote → a fresh subagent (not you).
- Code Claude or another non-Codex agent wrote → a **new** read-only Codex session
  (fresh `codex exec`, not a resume; the build session has a stake in its own
  work). Don't overwrite `codex-session-id`.
- Both → run both, each covering the other's files (use the author column).
- No subagents and Codex wrote everything → you are the only option; say the
  check is not independent.

Give the checker `task.md`, `plan.md`, the logged proof outputs and the diff
from `base.txt` for exactly the files this run touched, using the final-check
template.

- Clean `APPROVE` → done.
- `REVISE` → sort it as in Phase 2. Accepted fixes go back to whoever wrote that
  code; re-run the affected proofs, then one more fresh check. At most 1 fix
  round and 1 re-check; anything still open goes to the user.
- Any edit after the final check needs a new check. Never describe an earlier
  check as covering later edits.

Then report what landed (files, key changes), the proof results, the final
check result and anything left open, and stop. Do not commit, push or deploy
unless the user asks. If the user wants a record, copy `plan.md` and
`review-log.md` into the project, never the raw Codex files.

## Run folder

Everything needed to survive a crash or a cleared context is a plain file in `$RUN`:

| File | Purpose |
|---|---|
| `task.md` | the task verbatim, `ROOT`, whether it is a worktree, the model |
| `plan.md` | the current plan |
| `review-log.md` | append-only: each round's verdict and changes; each step's files with author; proof outputs |
| `research/<slug>.md` | one cited finding per file |
| `codex-session-id` | the plan/build session id; every resume uses it |
| `prompt-<name>.md` | the exact message sent on each call |
| `codex-<name>.jsonl`, `.md`, `.pid` | raw events, reply and process group per call |
| `base.txt` | commit and dirty files before step 1 |

Codex keeps its own session history and finds it by id. If a resume ever fails,
start a fresh Codex session seeded from `plan.md` and `review-log.md`, save the
new id, and note the reset in `review-log.md`.

## Failure handling

| Situation | Do this |
|---|---|
| Failed, empty or malformed review turn | Never approval. Retry once; then stop and tell the user. |
| Failed build turn | Stop the process group, inspect partial changes, resume only the unfinished part. |
| `APPROVE` with open high/medium objections | Treat as `REVISE`. |
| `BLOCKED` | Supply what's missing or stop. |
| 3 argument turns, no consensus | Stop; the user decides. |
| Plan edited or checkout moved after `APPROVE` | Approval void; one more full-plan turn. |
| Step still failing after 2 corrections | Stop; tell the user. |
| `HEAD` moved in a shared checkout | Stop; tell the user. |
| Final check still failing after 1 fix round | Report what's open. |
| Resume fails | Re-seed from `plan.md` + `review-log.md`, save the new id. |

## Deliberately left out

No cost tracking, no parallel Codex builders, no retries beyond the caps above,
no runner script. Add one only when a real run needs it.
