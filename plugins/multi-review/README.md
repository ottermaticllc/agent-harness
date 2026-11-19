# multi-review

Get the same change reviewed by several AI models at once, then one combined verdict.

## What it does

- Saves the diff for a target (uncommitted changes, a commit, a branch, a pull request or a diff file).
- Sends one identical review prompt to each reviewer, in parallel:
  - your own agent (Claude Code, Codex or other): a fresh subagent where your agent has them, otherwise the agent itself;
  - Codex CLI, in a read-only sandbox;
  - Gemini, through Google's Antigravity CLI (`agy`).
- Keeps reviewers independent: none sees another's findings before the end.
- Checks every finding that only one reviewer raised against the actual code.
- Writes one verdict: **SHIP**, **SHIP WITH AMENDMENTS** or **DO NOT SHIP**, with what to fix.

It skips any reviewer whose CLI is missing and says so. With no outside reviewer left, it labels the result a single-model review. If the host is Codex, it does not call Codex again as an outside reviewer.

## When to use it

Before merging or deploying a change where a mistake is expensive: several files, schema or migrations, auth, payments, build or deploy config, production data. Not for typos or one-line fixes.

## Install

Claude Code:

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install multi-review@agent-harness
```

Other agents (Codex and others that read Agent Skills): `npx skills add ottermaticllc/agent-harness --skill multi-review`, or copy `plugins/multi-review/skills/multi-review/` into your agent's skills folder (for example `~/.claude/skills/` or `~/.agents/skills/` for Codex).

Then ask: "multi-review my uncommitted changes" or "get a second opinion on commit abc1234 before I push".

## Configuration

None. Optional requirements:

- [Codex CLI](https://github.com/openai/codex), signed in (`codex login`). Tested with 0.163.0.
- [Antigravity CLI](https://antigravity.google) (`agy`), signed in (run `agy` once and follow its sign-in). Run `agy models` to see model ids.
- `gh` if you want to review pull requests by number.

## Example

Input: "multi-review the uncommitted changes" on a small repo where a commit claimed to make `mean()` safe on empty lists and "tidy" `median()`.

Output (shortened):

```
# Multi-review - uncommitted changes
Reviewers: inside (subagent), Codex
Skipped: Gemini - agy not found

## Verdict
DO NOT SHIP

## Raised by more than one reviewer
- [High] stats.py:13 - median parity reversed; median([1]) raises IndexError (inside, Codex)
- [High] stats.py:6 - mean([]) still raises ZeroDivisionError; the claimed fix is only a comment (inside, Codex)

## What to change before shipping
1. Revert the median change.
2. Add an empty-input guard to mean(), or drop the comment.
```

## What it reads, writes and sends

- **Reads:** the diff and any file in the repository the reviewers choose to open.
- **Writes:** only a temp run folder (`$TMPDIR/multi-review-XXXX`) with the prompt, raw replies and `synthesis.md`. It checks `git status` before and after to prove reviewers changed nothing.
- **Sends:** the diff and any files read go to OpenAI (Codex) and Google (agy), under whatever accounts those CLIs are signed in to. The inside reviewer uses your host agent's provider. Do not use the outside reviewers on code you may not share with those providers.
- **Costs:** one model call per reviewer plus the synthesis. A small diff took about 1 minute for Codex in testing.
- Never pushes, merges or deploys.

## Limits and known issues

- `agy` runs in plan mode (`--mode plan`) with the diff inside the prompt, so it needs no tools; the skill still checks `git status` afterwards. Tested on a toy file: it found both planted bugs and changed nothing. Very large diffs that don't fit in one prompt skip the Gemini reviewer.
- `agy` sometimes says it wrote a file without doing it; the skill uses its printed reply only.
- The Gemini path was tested by hand on that toy file only; it was not part of the full release test below.
- Codex's read-only sandbox blocks file writes, not side effects of MCP tools. Disable MCP servers for the review if you have any.
- Very large diffs can exceed the shell's argument limit for `agy -p`; the skill gives a workaround.
- Tested: Claude Code 2.1.318 host with a subagent and Codex 0.163.0 on a toy repo with two planted bugs. Both reviewers found both bugs and agreed on DO NOT SHIP. Codex as host was not tested.

## Author

Jared Schulman, OtterMatic LLC - https://jaredschulman.com
