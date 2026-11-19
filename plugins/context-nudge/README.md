# context-nudge

A strip above the prompt that warns you when the context window is filling up, and tells Claude to wrap up cleanly.

> **Claude Code only.** This is a mod: it uses Claude Code's early-access mods (function hooks) API and needs Claude Code 2.1.290 or newer (CLI or desktop app). The API may change between releases.

## What it does

It reads how full the context window is, on every tool call and at the end of every turn.

| Context used | What happens |
|---|---|
| 40% | A strip appears above the prompt: "Context 42%. Good point to wrap up." with **Hand off** and **Dismiss** buttons. Claude is told nothing. |
| 45% | Claude gets a hidden note: finish the steps left on the current piece of work, start nothing new, then recommend one of compact or hand off. |
| 65% | Claude gets a hidden note: stop after the current action, say where things stand, then recommend one of compact or hand off. |

Each line fires once. A drop of more than 15 points (after a compaction or `/clear`) resets everything. Subagents are ignored; only the main chat counts.

The hidden note tells Claude to give you a ready-to-paste `/compact` line that says what the summary must keep. Claude is told never to run `/compact` or `/session-handoff` itself. You decide.

## When to use it

- You work in long sessions and tend to notice the context is full only after quality drops.
- You want a nudge to hand off or compact at a calm moment, not mid-edit.

## Install

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install context-nudge@agent-harness
```

## Configuration

None. The thresholds (40, 45, 65) are constants in `hooks/register.tsx`.

## The Hand off button and `/compact`

**Hand off** runs the `session-handoff` command, which this repo provides as the `session-handoff` plugin. The mod checks at run time whether that command is installed.

- **Installed:** the strip shows the **Hand off** button, and Claude may recommend a handoff or a compact.
- **Not installed:** no Hand off button. The strip says "(try /compact)", and Claude is told to suggest only `/compact`. Nothing breaks.

## Example

```
Context 46%. Good point to wrap up.  [Hand off]  [Dismiss]
```

At 45%, Claude finishes the task in hand, then might say:

> Context is getting full. The migration is done and the next task is unrelated, so a handoff fits better than a compact. Run /session-handoff when you are ready.

## What it reads, writes and sends

- **Reads:** the session's context usage figure.
- **Writes:** one hidden message into the chat at 45% and at 65% (it is part of the conversation, so Claude sees it). Keeps its counters in the session's mod state, not on disk.
- **Sends:** nothing over the network of its own. The hidden messages go to the model as part of your normal turn, so they cost a few extra input tokens, twice per fill-up at most.

## Limits and known issues

- Right after a compaction the engine may report no reading; the mod waits for the next one.
- The check runs on tool calls and turn ends. A very long single reply can pass a line before it fires.
- The wording of the hidden notes is a nudge, not a guarantee. Claude may still keep going.
- The automated test proves the strip, dismiss and reset logic and the note text. It cannot prove the hidden message is delivered, because the test kit does not route that call. That part was only checked by reading the code.

## Author

Jared Schulman, OtterMatic LLC (https://jaredschulman.com)
