# explain-like-im-12

A skill that explains a technical topic in plain English with one everyday analogy, and says where the analogy breaks.

## What it does

When you ask for plain English, it:

- Picks one familiar source domain (a kitchen, the mail, a library).
- Maps three or more parts of the topic onto it, not just one.
- Names the point where the analogy stops working.
- Uses named characters and concrete objects.
- Ends by pointing forward, not by asking "does that make sense?".

It writes at the level of a smart 12-year-old: plain words, sentences of 12-18 words, short paragraphs.

## When to use it

- You are lost in a technical answer and want it re-explained.
- You say "explain like I'm 12", "ELI5" or "what does X mean".
- You want a jargon-heavy plan or piece of code explained to someone non-technical.

It does not fire on every technical answer. If you give no topic, it explains the most recent technical idea in the conversation.

## Install

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install explain-like-im-12@agent-harness
```

Other agents (Agent Skills format): `npx skills add ottermaticllc/agent-harness --skill explain-like-im-12`, or copy `plugins/explain-like-im-12/skills/explain-like-im-12/` into your agent's skills folder, for example `~/.claude/skills/` or `~/.agents/skills/` for Codex.

## Configuration

None.

## Example

Prompt: `explain like I'm 12: what is an API?`

Output (shape, not exact words): a restaurant analogy. You are the customer, the menu is the list of things you may ask for, the waiter carries your order to a kitchen you never see, and the kitchen sends food back the same way. Then the break: a real API has strict rules about how you word an order, and a waiter will forgive a mumbled one while an API will not.

## What it reads, writes and sends

Nothing beyond the conversation. It reads no files, writes no files and makes no network calls of its own.

## Limits and known issues

- Description-based triggering is a judgment call by the agent. It may miss a vague "I don't get it" or fire on a casual "what does that mean". Name the skill to force it.
- The old version of this skill also fired "proactively" whenever an answer had more than two hard terms. That was dropped; it over-triggered.
- Not every concept has a clean analogy. For very abstract topics the skill will say where the comparison fails early.
- Evals live in `evals/`; see the repository notes for the latest result.

## Author

Jared Schulman, OtterMatic LLC (https://jaredschulman.com)
