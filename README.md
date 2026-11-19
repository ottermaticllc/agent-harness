# agent-harness

Skills, Claude Code mods and a guide from the setup I use every day to run coding and research work with AI agents.

![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Version 1.0.0](https://img.shields.io/badge/version-1.0.0-green)

- **Skills** follow the open [Agent Skills](https://agentskills.io) format, so they work in Claude Code, Codex and other agents that read `SKILL.md` files.
- **Mods** are for Claude Code only. They use its early-access mods API (Claude Code 2.1.290 or newer, CLI or desktop app), which may change between releases.
- Every item was rewritten from my private version for strangers, then tested. Each item's README says what was tested and what was not.

## Featured

| Item | Type | What it does |
|---|---|---|
| [session-handoff](plugins/session-handoff/) | skill | Saves a session to a handoff file and gives you a paste-ready prompt for the next one. Resumes with one next action. In the Claude desktop app it can start and brief the next session itself. |
| [drift-watch](plugins/drift-watch/) | mod | A side panel that checks whether a session is drifting from its goal, shows who moved it, and flags deploys and stuck helpers. |
| [multi-review](plugins/multi-review/) | skill | Independent code review by several model families at once (your agent, Codex, Gemini), combined into one ship / don't-ship verdict. |
| [codex-loop](plugins/codex-loop/) | skill | Plan a change, have Codex attack the plan, approve it, then have Codex build it step by step with proof checks. |
| [Wave orchestration guide](guides/wave-orchestration/) + [wave-digest](plugins/wave-digest/) | guide + skill | How to run many agents in rounds ("waves") that hand off through files, with a small example you can run today. |
| [sessions-panel](plugins/sessions-panel/) | mod | `/sessions`: every Claude Code and Codex session on your computer, with status and context use, and an End button that asks first. |
| [context-nudge](plugins/context-nudge/) | mod | Tells you, and Claude, when the context window is filling up, and suggests a handoff before quality drops. |

## Also included

| Item | Type | What it does |
|---|---|---|
| [short-and-sweet](plugins/short-and-sweet/) | mod | A per-chat switch for 1 to 3 sentence replies, with a "Tell me more" button. |
| [cache-timer](plugins/cache-timer/) | mod | Minutes left before the prompt cache expires, under the input box. |
| [explain-like-im-12](plugins/explain-like-im-12/) | skill | Plain-English, analogy-first explanations, including where the analogy breaks. |
| [explain-deck](plugins/explain-deck/) | skill | Turns your own files on a topic into a short offline HTML deck with speaker notes and a quiz. |
| [market-map](plugins/market-map/) | skill | Builds a market map from public filings: who serves a group of buyers and how concentrated it is, with an honest count of what the data covers. |

## Install

**Claude Code.** Type these inside Claude Code, one at a time:

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install session-handoff@agent-harness
```

Or from a terminal:

```bash
claude plugin marketplace add ottermaticllc/agent-harness
claude plugin install session-handoff@agent-harness
```

Swap `session-handoff` for any item name above and install only what you want. Mods need Claude Code 2.1.290 or newer (`claude --version`). A mod has no skills or commands of its own to list, so check it by its effect: each mod's README says what you should see.

**Codex and other agents** (skills only):

```bash
npx skills add ottermaticllc/agent-harness --skill session-handoff
```

Without `--skill` it asks which skills, which agents and where to install. Add `-a codex -g -y` to install for Codex for your user without questions, or `--list` to see what's available.

Or copy a skill folder by hand, for example `plugins/session-handoff/skills/session-handoff/`, into your agent's skills folder: `~/.claude/skills/` for Claude Code, `~/.agents/skills/` for Codex ([Codex docs](https://developers.openai.com/codex/build-skills)), or your agent's equivalent.

Some skills need other tools: multi-review and codex-loop need the [Codex CLI](https://github.com/openai/codex) (multi-review can also use Google's Antigravity CLI `agy`). Each README lists its needs.

## What these do and don't do

- Nothing here pushes, deletes, sends messages or ends processes without asking you first.
- Skills that call another model send your diff or plan to that provider under your own account. Each README has a "What it reads, writes and sends" section.
- These are tools I use, shared as they are. Test them on your own work before you rely on them. See [SECURITY.md](SECURITY.md).

## Checks

From a clone of the repo:

```bash
python3 scripts/check.py        # skill names, descriptions, manifests, referenced files
claude plugin validate .        # marketplace and plugin manifests
claude plugin test plugins/drift-watch   # mod tests (any mod folder)
```

## About me

I'm Jared Schulman. I run OtterMatic LLC and help teams put AI agents to work. Portfolio and contact: [jaredschulman.com](https://jaredschulman.com).

## License

[MIT](LICENSE). explain-deck adapts methods from [Presenton](https://github.com/presenton/presenton) (Apache-2.0); see its NOTICE file.
