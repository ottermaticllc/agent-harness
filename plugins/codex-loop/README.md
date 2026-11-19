# codex-loop

A plan-review-build loop for risky coding work: your agent plans, Codex CLI attacks the plan, you approve, then Codex builds it one checked step at a time.

## What it does

1. **Plan.** A fresh subagent writes a numbered plan. Every step has its files, a done-condition and a proof command.
2. **Agree.** Codex reviews the plan in a read-only sandbox and answers `APPROVE`, `REVISE` (with evidence-backed objections) or `BLOCKED`. Your agent accepts the real objections and argues back on the rest, for at most 3 turns.
3. **Gate 1.** You see the final plan and any remaining disagreement. Nothing is built until you say go.
4. **Build.** Codex resumes the same session and builds one step at a time, with write access to the repo only and no network. Your agent reads each diff and runs each proof itself before the next step. Steps that need network, credentials or production wait for your OK.
5. **Final check.** A model that did not write the code checks the result against the plan.

Every Codex reply passes a validity check. A crash, timeout or vague answer is never treated as approval.

## When to use it

For changes where a wrong turn is expensive: schema or migrations, auth, payments, production config, a real choice between architectures, or a long multi-step build. Not for anything you would finish in about 15 minutes. The skill says so and offers to just do the task.

## Install

Claude Code:

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install codex-loop@agent-harness
```

Then start it yourself with `/codex-loop <task>`. The skill sets `disable-model-invocation: true`, so Claude never starts it on its own.

Other agents: `npx skills add ottermaticllc/agent-harness --skill codex-loop`, or copy `plugins/codex-loop/skills/codex-loop/` into your agent's skills folder (for example `~/.claude/skills/` or `~/.agents/skills/` for Codex). Agents that ignore `disable-model-invocation` still get the written rule: never start without your explicit go-ahead.

## Configuration

No settings. Requirements:

- [Codex CLI](https://github.com/openai/codex), signed in. Commands were checked against 0.163.0.
- `git`, `jq`, `perl` (for stopping a timed-out Codex run cleanly).
- Subagents (Claude Code) for planning and the final check. Without them the agent does these itself and says the work was not checked independently.

Codex uses its configured default model unless you name one at the start; the same model is then used for every call.

## Example

```
/codex-loop add a soft-delete flag to the orders table and hide deleted orders in the API
```

Shortened run:

```
Run folder: /tmp/codex-loop-a1B2
Is any other session working in this repo during this task?  > no

Plan (5 steps) ready. Codex review, round 1: REVISE
  1. [high] step 3 - the admin export still reads all rows; deleted orders leak into CSV. Fix: filter there too.
  2. [low] step 2 - rename the column to is_deleted.
Taking 1. Pushing back on 2: existing columns use deleted_at.
Round 2: APPROVE

Gate 1 - final plan below. Step 4 [orchestrator] runs the migration on your dev database. Go?  > go

Step 1 ... proof `npm test -- orders` passed
...
Final check (fresh subagent): APPROVE
Landed: 4 files changed, 1 migration. All proofs passed.
```

## What it reads, writes and sends

- **Reads:** your repository. Codex reads files in the repo during review and build.
- **Writes:** a temp run folder (`$TMPDIR/codex-loop-XXXX`) with the plan, prompts, Codex replies and a review log. Codex writes only inside the repo (and temp folders) during approved build steps. The agent never commits, pushes or deploys unless you ask.
- **Sends:** the plan and any files Codex reads go to OpenAI under your Codex account. The planner and checker subagents use your host agent's provider.
- **Costs:** several model calls per run: one planner, 1 to 4 Codex review turns, one Codex turn per coding step (plus up to 2 corrections each), and one or two final checks. Each Codex call usually takes 1 to 5 minutes.

## Limits and known issues

- Tested on a toy Python repo with Claude Code 2.1.318 and Codex 0.163.0: a fresh read-only plan review (returned `APPROVE`), a resume by saved session id after a deliberately conflicting plan edit (returned `REVISE` and caught both planted problems), and a check that a resumed read-only session cannot write a file (blocked). A build step was also run: the documented workspace-write command resumed the review session by id, fixed both planted bugs, and changed only the target file. The full loop end to end (plan, two gates, several build steps, final check) has not been run as one test.
- Read-only blocks file writes, not side effects of MCP tools. The skill tells the agent to switch off configured MCP servers for reviews.
- Codex's sandbox often blocks running tests, so the agent runs each proof itself. Proofs that need network or a database are `[orchestrator]` steps.
- The loop is slow on purpose. Expect tens of minutes for a five-step plan.
- If you run the host agent *as* Codex, the review is no longer a second model family. Use `multi-review` with another reviewer instead.

## Author

Jared Schulman, OtterMatic LLC - https://jaredschulman.com
