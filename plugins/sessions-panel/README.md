# sessions-panel

A `/sessions` pane that lists every live Claude Code and Codex session on your computer, with a confirm-first End button for idle ones.

> **Claude Code only.** This is a mod: it uses Claude Code's early-access mods (function hooks) API and needs Claude Code 2.1.290 or newer (CLI or desktop app). The API may change between releases.

## What it does

Type `/sessions` and a pane opens beside the chat. It refreshes every minute while open.

- **One row per session:** name, status (working, waiting, idle, old), context used, where it runs (desktop app, VS Code, terminal), start time, last activity, CPU, running subagents.
- **Click a name for details:** last message you typed, context and cache, memory, folder, its subagents (task, model, tokens), and the helper programs it started (MCP servers, shell commands) with CPU, memory, ports and a rough token count per tool.
- **Memory line at the top:** how much of the computer's memory is free and how much has spilled to disk.
- **End button** on idle sessions only. It asks you to confirm first.
- **Leftover helpers:** MCP servers and similar programs whose parent program has exited. Listed only; the pane never ends them.
- **Summarize in 2 sentences** (on request) for any helper program or subagent, from a small model.

Status means:

| Status | Meaning |
|---|---|
| working | mid-reply, or running a command |
| waiting | done; prompt cache still warm, so the next message is cheap |
| idle | done; cache has expired |
| old | no message in 12+ hours |

## When to use it

- Your computer is slow and you want to see which sessions and helper programs use the memory.
- You lost track of how many sessions are open across the app, editors and terminals.
- You want to close sessions you have forgotten about without hunting for their windows.

## Install

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install sessions-panel@agent-harness
```

Needs `python3` on your `PATH` (macOS ships one; most Linux systems do too).

## Configuration

None.

## Example

```
3 Claude · 1 Codex · updated 2:41 PM · refreshes every minute · click a name for details
Memory OK: 34% free right now (about 5.4 of 16 GB).
Nothing has overflowed to disk. These sessions use about 2.1 GB (a low estimate).

Claude sessions
Session                 Status   Context        Location          Last active        CPU  Subs
▸ Fix the login bug     working  92k · 46%      VS Code           2:40 PM (1m)       12%  1
▸ Write release notes   waiting  41k · 21%      Desktop app       2:31 PM (10m)      0%   0
▾ Refactor billing      idle     310k · 31%     Terminal          11:02 AM (3.6h)    0%   0
    Context: 310k of 1.0M tokens · 31% (window assumed)
    Last message · 11:02 AM (3.6h)
    move the invoice code into its own module
    End "Refactor billing"? This sends SIGTERM to PID 48213. Its transcript stays on disk
    and can be resumed with claude --resume.   [Confirm end]  [Cancel]
```

## How End stays safe

1. You press **End session**, then **Confirm end**. Nothing is signalled before the second press.
2. The script takes a fresh process snapshot and re-checks, right before signalling, that the PID is still the same session (same session ID for Claude, same start time for Codex), still idle, and not the session showing the pane or any of its parents. Any mismatch: nothing is sent.
3. It sends `SIGTERM` only, never `SIGKILL`. For Claude it signals the session's own process; for Codex, the Codex root process and its direct children.
4. It only ever targets processes it found as Claude Code or Codex sessions. Other programs, including leftover helpers, have no End button.
5. Each signal sent is logged, one line, to `end.log` in the plugin's data folder.

## What it reads, writes and sends

- **Reads:** `~/.claude/sessions/*.json` (files each running Claude Code process writes about itself), session transcripts under `~/.claude/projects/`, open Codex session files under `~/.codex/sessions/`, the process list (`ps`), listening ports (`lsof`), memory figures (`sysctl` and `memory_pressure` on macOS, `/proc/meminfo` on Linux). The pane shows your last typed message and command lines; values after flags named like key, token, secret or password are masked as `***`.
- **Writes:** only `end.log` in the plugin's data folder (`${CLAUDE_PLUGIN_DATA}`), when you end something.
- **Sends:** nothing, unless you press **Summarize in 2 sentences**. That sends the helper's masked command line, or the subagent's task text, to a small Claude model (one call of up to 160 output tokens, billed like any model call).
- **Signals:** `SIGTERM` to one session's processes, only after you confirm.

## Limits and known issues

- **Relies on undocumented files.** `~/.claude/sessions/<PID>.json` and the transcript format are Claude Code internals. A Claude Code update can change them and break the list.
- **Context window is partly assumed.** The engine reports the window for the session showing the pane, and Codex records its own. Other Claude sessions don't record theirs, so the pane assumes the same window as yours, or 1M once a session's tokens pass it. Those rows say "(window assumed)".
- **Cache timing is an estimate.** The lifetime (5 minutes or 1 hour) comes from each transcript's own usage records; when none is found, the pane assumes the 5-minute default. The exact server-side expiry isn't recorded anywhere it can read.
- **Codex busy/idle** comes from the session file when Codex has one open, otherwise from CPU (5% or more counts as busy).
- **Token counts per tool** are rough: about 4 characters per token, from the last 3 MB of the transcript.
- **"Leftover helper"** means "parent exited and the command looks like an MCP server". It can include helpers you started on purpose. That's why the pane lists them but never ends them.
- **Ending a desktop-app or VS Code session** stops its process. Whether the app restarts it, and whether your SessionEnd hooks run on `SIGTERM`, depends on Claude Code and was not verified.
- **Platforms:** tested on macOS only. The script has Linux code paths (`/proc/meminfo`, `ps -A`) but it has not been run on Linux, and Claude Code's session files there may record process start times differently, in which case no sessions will show. Windows is not supported.
- The listing script was run against real sessions on macOS (2026-11-18) and listed them correctly; the pane itself was only drawn by the test kit.
- Each refresh reads every live session's transcript tail; with many large sessions it can take a few seconds.

## Author

Jared Schulman, OtterMatic LLC (https://jaredschulman.com)
