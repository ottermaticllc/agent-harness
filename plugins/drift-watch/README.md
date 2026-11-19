# drift-watch

A side panel for Claude Code that keeps checking whether a session is still working toward its goal, and says who moved it when it is not.

> **Claude Code only, early access.** This is a mod: it uses Claude Code's early-access mods (function hooks) API. It needs Claude Code 2.1.290 or newer (CLI or desktop app). The API may change between releases, and a change can break this mod. Test it before you rely on it. Status: 57 automated tests pass; this public version has not yet been run in a full live session.

## What it does

- **Names the goal.** It reads the goal from your first message of 15 words or more, from `/drift goal <text>`, or from a handoff file in a `.handoffs/` folder that your first message names. A small model call turns it into a short label, a "done when" line and up to 6 milestones.
- **Checks the session every 3rd message you type.** It scores how well the current work serves the goal (0 to 100). It marks the session off track after two low scores in a row (under 50) or one clear move away. It says who moved it: Claude, you, or both. It ends the off-track state at a score of 65 or more, or when the work comes back.
  - Claude moved it: an amber card and a pop-up, with **Stop and correct** and **Fine, keep going**.
  - You moved it: a quiet yellow card, no pop-up. **Fine** marks it as an okayed side trip. **It's a new goal** opens the new-goal card.
- **Watches Claude when you step away.** If you have been quiet for 5 minutes and Claude is still using tools, it checks at most every 5 minutes whether any action clearly conflicts with what you asked. Examples: the wrong environment, a step you asked for being skipped, a deploy you did not approve.
- **Checks deploys at once.** A deploy command (`vercel --prod`, `netlify deploy`, `wrangler deploy`, `fly deploy`, `firebase deploy`, `npm publish`, `supabase functions deploy`, `npm run deploy`, or an MCP tool with "deploy" in its name) triggers a check right away. Database pushes and pushes to `main` are counted on the panel but do not trigger a check.
- **Flags stuck helpers.** Two or more background helper agents running while the main loop has been silent for 30 minutes raises an alert. This needs no model call.
- **Spots new goals.** When you switch to a different goal, a card asks whether to continue here or hand off. It recommends a hand-off when the new goal is unrelated, has 4 or more milestones, or context is above 60%. The goal changes only when you press a button.
- **Draws the path.** A picture of each check (on track, off track, side trips, milestones reached) plus context % and compaction count. The terminal gets the same turns as plain lines.

Nothing reaches Claude unless you press a button. **Stop and correct** stops Claude's running turn at once and opens a correction you can edit; it is sent as you only when you press Send. **Hand off** puts a summary in your prompt box for you to read and send yourself; it never sends.

## When to use it

- Long sessions where the work wanders from what you set out to do.
- Letting Claude run while you are away, with a second pair of eyes on deploys and off-goal work.
- Sessions with several background helpers that can stall.

It is not useful for short one-question sessions, or for `claude -p` and SDK runs: with no app or terminal attached it makes no checks and no model calls.

## Install

In Claude Code:

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install drift-watch@agent-harness
```

The panel opens by itself in the desktop app and VS Code. In the terminal, type `/drift` to open it.

## Configuration

There are no settings. Commands:

| Command | What it does |
|---|---|
| `/drift` | Opens the panel. |
| `/drift goal <text>` | Sets the goal in your own words. |
| `/drift off` | Pauses checks in every session (kept across restarts). No model calls while paused. |
| `/drift on` | Resumes checks. |

In the panel, **Edit goal** changes the current goal's words in place and re-scores the earlier checks against them. **New goal** starts a separate goal; the old one is paused and can be returned to.

**Optional: session-handoff.** If you use the `session-handoff` plugin from this repo, start a new session with a message that names the handoff file, for example `Resume from .handoffs/2026-01-12-auth-refactor.md`. drift-watch reads the goal from that file. It reads only `.md` files inside a `.handoffs/` folder, and never a file whose name looks like a secret (`credential`, `secret`, `token`, `key`, `.env`). The **Hand off** text starts with a plain instruction to write a handoff; if you have a handoff command, you can put it in front before you send.

## Example

You open a session with: "Add CSV export to the invoices page, with a test for the date column format, then open a PR."

After your third message the panel shows:

```
THIS SESSION'S GOAL                           0 of 3
Add CSV export to invoices
Done when: export works, the date test passes, PR open.
Context 22% · Compacts 0

On track · checked at 2:41 PM
Now: writing the export endpoint

MILESTONES
→ 1. Build the export endpoint
  2. Test the date column format
  3. Open the PR
```

Three messages later Claude has started reformatting the whole invoices module:

```
Off track since message 5.
Claude started this. You haven't okayed it.
Now: reformatting invoices module
[Stop and correct] [Fine, keep going] [New goal] [Hand off]
```

## What it reads, writes and sends

**Reads**
- Your typed messages, Claude's replies, and a short summary of each tool call (for Bash: the description and the command; for file tools: the path).
- The session's message history, once, when the mod loads partway through a session.
- A `.handoffs/*.md` file your first message names (first 8 KB).
- The newest plan-like file Claude read or wrote this session (a path with `PLAN`, `ROADMAP`, `STATE` or `.planning/`; first 8 KB), to write milestones. Files with secret-looking names are skipped.
- Context %, the list of running helper agents, and the `HOME` variable (to expand `~/` in a handoff path).

**Sends over the network**
- Each check is one call to the Haiku model through Claude Code's own model connection, billed like the rest of your Claude Code use. The prompt holds the goal, your recent messages (up to 30, the older ones cut to 120 characters), Claude's recent replies, and up to 40 recent tool-call summaries. Goal calls also hold up to 8 KB of the handoff file and 8 KB of the plan file.
- Tool-call summaries include up to 220 characters of each Bash command. If you put a secret in a command line, part of it can be sent in a check.
- Nothing else leaves your machine. There is no telemetry.

**Writes**
- Session state (survives a mod reload, not a restart).
- The plugin's own store (Claude Code's per-plugin storage): the pause flag, and a snapshot of each session's goals, check rows and open new-goal card, so a restart brings them back. Only the newest 5 sessions are kept; older snapshots are deleted.
- No files.

**Costs (model calls)**

| When | Calls |
|---|---|
| Naming or planning a goal | 1 per new goal, edited goal or spotted switch (up to 1,200 output tokens) |
| Session check | 1 per 3 typed messages |
| While you are away and Claude is working | at most 1 per 5 minutes (about 12 per hour) |
| Deploy command | 1 per deploy |
| Re-score after **Edit goal** | 1 per edit |
| Stuck helpers, paused, headless | 0 |

Each call sends roughly 1,000 to 5,000 input tokens and asks for at most 400 output tokens (1,200 for goal calls). A busy hour of chat with 30 messages is about 10 to 12 calls. An unattended 8-hour run is about 100 calls.

## Limits and known issues

- **The verdict is not stable.** In the author's replay of past sessions, the off-track state came out differently on about 18% of repeated checks of the same moment. Treat an amber card as "worth a look", not as proof. Rules in code (two lows in a row, a 65 to end it) damp this but do not remove it. This was measured on an earlier private version; this version's prompts were reworded and have not been re-measured.
- **Small drift is missed.** The same replay caught clear drift but missed slow widening of scope, where each step looks related.
- **The goal can be misread.** A first message of 15 words or more is taken as the goal. If it is wrong, use **Edit goal** or `/drift goal`.
- **Deploy detection is a pattern match.** Quoted text and heredoc bodies are ignored, so `bash -c "vercel --prod"` is missed. A bare `git push` while on `main` is not counted, since the branch is not in the command.
- **Checks run on a 1-minute tick**, one at a time, so a verdict can land a minute or more after the action.
- **Mobile** draws no text field: no **Edit goal** or **New goal** there.
- **Restart recovery is partial.** Goals, the path and an open card come back; the message count is rebuilt from history; open alerts do not come back.
- **Live testing:** this version passes its 57 automated tests (`claude plugin test`, Claude Code 2.1.318) and `claude plugin validate`. It has not yet been run live in a full session in this form.

## Author

Jared Schulman, OtterMatic LLC (https://jaredschulman.com). MIT license.
