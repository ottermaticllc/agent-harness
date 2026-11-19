# short-and-sweet

A per-chat switch that keeps Claude's replies to 1-3 plain sentences, with a **Tell me more** button for when you want the long answer.

> **Claude Code only.** This is a mod: it uses Claude Code's early-access mods (function hooks) API and needs Claude Code 2.1.290 or newer (CLI or desktop app). The API may change between releases.

## What it does

- `/short-and-sweet` toggles the mode for this chat. The status line shows "Short and Sweet on" while it is active.
- While on, each prompt you type carries an added rule: 1 to 3 simple sentences, no headings, no bullet lists, no recap.
- The rule steps aside when you ask for more ("explain", "walk me through it", "list the steps"), when the work itself is the answer (drafts, code, files), and for safety text (what you are approving, exact error messages).
- After each reply a **Tell me more** button appears above the prompt. It sends "Tell me more about that." and that one answer is allowed to run long.

## When to use it

- You want quick answers by default and long ones only on request.
- You find replies padded with recaps and bullet lists.

## Install

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install short-and-sweet@agent-harness
```

## Configuration

None. The rule text is the `RULE` constant in `hooks/register.tsx`; edit it to change the length or tone.

## Example

```
> /short-and-sweet
Short and Sweet is on for this chat. Replies stay to 1-3 sentences unless you ask for more.

> What is DNS?
DNS turns names like example.com into the numeric addresses computers use. Your device asks a DNS server first, then connects to the address it gets back.
                                                         [Tell me more]
```

## What it reads, writes and sends

- **Reads:** nothing from disk.
- **Writes:** two flags (on/off, reply-just-finished) in the session's mod state. Nothing on disk.
- **Sends:** nothing of its own. The rule (about 150 words) is added to your prompt as context, so it costs a few input tokens per message while on.

## Limits and known issues

- Tested live once (Claude Code 2.1.318): with it on, a "how does HTTPS work" question got a 65-word answer; the same question without it got 609 words.

- It is per chat and resets when the session restarts.
- The rule is an instruction to the model. It usually follows it, but nothing enforces the length.
- It says it overrides output styles, but a strong output style can still win.
- The rule is not added to slash commands or to the Tell me more press.

## Author

Jared Schulman, OtterMatic LLC (https://jaredschulman.com)
