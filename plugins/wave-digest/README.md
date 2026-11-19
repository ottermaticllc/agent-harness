# wave-digest

A small, runnable example of wave orchestration: three parallel workers scan a folder of projects, and one writer turns their files into a daily digest.

Companion to the [wave orchestration guide](../../guides/wave-orchestration/README.md). The digest is useful on its own, and the folder it leaves behind shows each piece of the pattern: parallel workers, a file handoff, validation and recovery.

## What it does

- **Wave 1**, three read-only workers in parallel:
  - `git`: commits in the time window and uncommitted changes, per repo.
  - `todos`: every TODO and FIXME line, grouped by project.
  - `notes`: `.md` and `.txt` files changed in the window, with a one-line summary each.
  Each worker writes one Markdown file and a status JSON.
- **Between waves**, the orchestrator runs `scripts/validate.sh`, spot-checks empty results, and recovers a failed worker once (re-run it, or run its commands itself).
- **Wave 2**, one writer combines the three files into `digest.md` with a "Top of mind" list and a Coverage section that says which sources worked.

## When to use it

- You want a quick morning or end-of-day look at what changed across a folder of projects.
- You want a working example of parallel subagents with file handoff to copy for your own wave.

## Install

Claude Code:

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install wave-digest@agent-harness
```

Other agents: `npx skills add ottermaticllc/agent-harness --skill wave-digest`, or copy `plugins/wave-digest/skills/wave-digest/` into your agent's skills folder (for example `~/.claude/skills/` or `~/.agents/skills/` for Codex).

Codex CLI without a skills folder: run the script directly.

```
bash skills/wave-digest/scripts/codex-wave.sh ~/projects ./wave-digest/$(date +%F) 24
```

## Configuration

Three inputs, all optional, given in plain words when you ask for the digest:

- the folder to scan (default: the current directory)
- the time window in hours (default: 24)
- the output folder (default: `./wave-digest/YYYY-MM-DD`)

The Codex script also reads `WAVE_TIMEOUT` (seconds per worker, default 300) and `WAVE_MODEL` (a Codex model name; default is your Codex config).

## Example

Ask: "Run wave-digest on ~/projects for the last 24 hours."

Output folder:

```
wave-digest/2026-01-05/
  git.md  todos.md  notes.md  digest.md
  .status/git.json  todos.json  notes.json  digest.json
```

`digest.md` from a test run on a sample folder (two repos, one notes folder):

```markdown
# Daily digest, 2026-01-05

## Top of mind
- alpha/src/fetch.py:2 has "FIXME: retry on timeout instead of failing". Commit 11c3a16 ("Add fetch client") added this client today, so the gap is fresh.
- alpha has 1 file with uncommitted changes. Check it before more commits land on top.
- notes/planning-call.md says the parser ships Friday, and alpha/src/parse.py:2 still has "TODO: handle empty input".

## Git
- alpha: 2 commits today, eae9861 "Add parser stub" and 11c3a16 "Add fetch client". 1 uncommitted file.

## TODO and FIXME
FIXME: 1. TODO: 4. Total: 5.
...

## Coverage
- git: complete
- todos: complete
- notes: complete
```

## What it reads, writes and sends

- **Reads**: the folder you name. It runs `git log`, `git status`, `grep` and `find`, and reads the first 20 lines of recently changed notes. It never runs a git command that changes a repo.
- **Writes**: only the output folder.
- **Sends**: nothing of its own. Your agent sends the prompts and the scanned text (commit messages, TODO lines, note openings) to its model provider, as any agent session does. Do not point it at a folder whose contents you would not paste into that agent.
- **Costs**: four model sessions per run (three workers and one writer). In the author's test on a tiny sample folder, Claude Code workers on Sonnet finished in 9 to 14 seconds each, and the Codex script took about 45 seconds end to end. Bigger folders cost more.

## Limits and known issues

- Results are only as good as the commands. `validate.sh` checks that files exist; it cannot tell a true "nothing found" from a broken scan. The skill tells the orchestrator to spot-check empty results for that reason. A test run hit exactly this: an early version of the `find` commands excluded every path containing `wave-digest`, including the folder being scanned, and the workers honestly reported zero repos.
- The workers skip folders named `wave-digest`, `.git`, `node_modules`, `dist` and `build`. If you put the output folder inside the scanned folder under a different name, its own files will show up in the next run.
- Inside a sandboxed agent on macOS, `/usr/bin/git` can fail because it can't write its cache file. In testing, the git worker then wrote `status: error` and the digest said git was unavailable, which is the intended behavior. In one run the orchestrator recovered by using another git install. In another it didn't. Run outside the sandbox, or allow git, if you need the git section.
- The TODO scan stops at 200 hits and the notes scan at 50 files.
- Workers sometimes leave `started_at` empty in their status file. It does not affect the run.
- In Claude Code the subagent tool has no per-agent timeout field (checked 2026-11-18), so a hung worker is noticed only when the wave never finishes. The Codex script enforces a timeout per worker.
- Tested on macOS with Claude Code (Sonnet subagents) and Codex CLI 0.163. Not tested on Linux, Windows, or other agents.

## Author

Jared Schulman, OtterMatic LLC (https://jaredschulman.com)
