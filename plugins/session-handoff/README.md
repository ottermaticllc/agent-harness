# session-handoff

Save a coding session to a file so the next session can pick it up, with one clear next action.

## What it does

One skill with four modes:

- **prompt** (default): writes `.handoffs/HANDOFF-YYYYMMDD-HHMM.md` in your project, then prints a short prompt you paste into a new session. Works in any agent: Claude Code, Codex, and others.
- **auto-start**: same file, then the agent starts the next session itself, briefs it, and checks the new session's written readback before it starts work. Needs the Claude desktop app. Anywhere else it falls back to prompt mode and says so.
- **close**: wraps up with no file. A short summary, one next step, and a commit only if you ask for one.
- **resume**: reads the newest handoff, checks it against the current git state, and continues with exactly one next action.

The handoff file holds: why you stopped, the goal and current approach, what got done, decisions in force, rules and limits ("don't touch X"), open questions, the task list, a git snapshot, files touched, files to read first, and the one next action.

## When to use it

- Your context window is getting full and you want a clean restart.
- End of day, or you are pausing work for a while.
- You are switching agents (for example, Claude Code to Codex) partway through a task.
- You want to finish a session tidily and commit only what that session changed.

## Install

Claude Code:

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install session-handoff@agent-harness
```

Other agents: `npx skills add ottermaticllc/agent-harness --skill session-handoff`, or copy `plugins/session-handoff/skills/session-handoff/` into your agent's skills folder (for example `~/.claude/skills/` or `~/.agents/skills/` for Codex).

Then say "hand off", "resume", "close out the session", or "hand off with auto-start".

## Configuration

None. Handoff files always go to `<project root>/.handoffs/`, where the project root is the git top level, or the current folder outside git. You will probably want to add this line to `.gitignore`:

```
.handoffs/
```

The skill suggests it but never edits `.gitignore` itself.

## Example

In `~/projects/my-app`, after a session that added a password reset:

> **You:** Context is getting long, save a handoff.

```
Handoff saved: ~/projects/my-app/.handoffs/HANDOFF-20261118-1730.md
Decisions: 1  Blockers: 1  Files touched: 2

Resume work from the handoff file at ~/projects/my-app/.handoffs/HANDOFF-20261118-1730.md.
Read it in full, then the files listed under "Read these first".
Tell me in one line what the next action is, then do it.
Follow the "Rules and limits" section; ask before anything it says needs my OK.

Tip: .handoffs/ is not in .gitignore. Consider adding it.
```

(The real output uses the full absolute path.) Next day, in a new session:

> **You:** Resume where we left off.

```
Resumed from: .handoffs/HANDOFF-20261118-1730.md  (created 2026-11-18 17:30 PST)
Goal: ship password reset with 30-minute link expiry
Decisions in force: 1   Open blockers: 1
Conflicts: none
Next action: write a unit test for resetPassword in tests/reset.test.js
```

Then it writes the test.

## What it reads, writes and sends

- **Reads:** the conversation, your project files, and `git status` / `git log` / `git rev-list`.
- **Writes:** one new Markdown file in `.handoffs/` per handoff (prompt and auto-start modes). Auto-start also writes a `-readback.md` file next to it and may append an "Added during alignment" section to the handoff. Close mode writes nothing, unless you ask it to commit.
- **Git:** close mode commits only when asked, staging only the files this session changed, by explicit path. It pushes only when asked and an upstream exists. It never runs `git add -A`, switches branches, resets, or rebases.
- **Network:** nothing beyond your agent's normal model calls. A push (only when you ask) contacts your git remote.
- **Cost:** no extra model calls in prompt, close, and resume modes. Auto-start runs a second session plus up to 3 short correction rounds.
- **Secrets:** the skill is told to write `<redacted>` instead of any key or token from the conversation. Read a handoff before sharing it anyway.

## Limits and known issues

- The handoff is only as good as the agent's memory of the conversation. In a very long session, early details may be thin. Hand off before context gets critical, not after.
- Auto-start depends on the Claude desktop app's session tools, which may change. The evals cover only its fallback, because eval runs have no session tools. It was also run once by hand in the desktop app on a toy project (2026-11-18): the new session renamed itself, wrote an accurate readback that flagged a real gap in the handoff, got ALIGNED in one round, then did the next action correctly. One run is not a guarantee.
- "Files touched" comes from the agent's own edit calls. Files changed by shell commands (formatters, code generators) may be missed. Check `git status` in the snapshot.
- Resume picks the newest file by name. If you hand-edit file names, keep the `HANDOFF-YYYYMMDD-HHMM` pattern.
- Close mode keeps the next step only in the chat. If you need it tomorrow, use prompt mode.

## Author

Jared Schulman, OtterMatic LLC (https://jaredschulman.com)
