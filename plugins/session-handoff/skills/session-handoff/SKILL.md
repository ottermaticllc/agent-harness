---
name: session-handoff
description: Saves the current coding session to a handoff file in the project and prints a short paste-ready prompt to start the next session; resumes from the newest handoff with exactly one next action; can start and brief the next session itself in the Claude desktop app; or closes out a session cleanly with no file. Use when the user says "hand off", "save the session", "context is getting long", "end of day", "pick this up tomorrow", "resume from the handoff", "where did we leave off", "close out the session", or "wrap up".
license: MIT
---

# Session handoff

One skill, four modes. Pick the mode from the user's words, then follow only that section.

| Mode | Trigger words | What happens |
|---|---|---|
| `prompt` (default) | "hand off", "save the session", "handoff" with no mode | Write a handoff file, print a paste-ready prompt for the next session |
| `auto-start` | "auto-start", "start the next session", "live handoff" | Same as `prompt`, then start and brief the next session yourself, if your harness can |
| `close` | "close out", "wrap up", "end the session", "no handoff file" | Summary and one next step, no file. Commit only if asked |
| `resume` | "resume", "where did we leave off", a path to a `HANDOFF-*.md` file | Read the newest handoff and continue with ONE next action |

Any other words the user adds are the reason for the handoff (save modes) or a path (resume).

## Rules for every mode

- **Never stage with `git add -A`, `git add .` or `git commit -a`.** Stage explicit paths only, and only files this session created or changed.
- **Never switch, create or delete branches.** Never push, reset, stash or rebase unless the user asked for that in this request.
- **Never write secrets** (keys, tokens, passwords, connection strings) into a handoff file or a summary, even if they appeared in the conversation. Write `<redacted>` instead.
- **Never edit or delete an earlier handoff file.** The newest one replaces it.
- State only what happened. A step is "done" only when a file, a command result or the user's word shows it. Otherwise say "not verified".
- Exactly ONE next action. Not a list, not a menu of options.

## Where handoff files live

`<project-root>/.handoffs/HANDOFF-YYYYMMDD-HHMM.md`

- `project-root` is the git top level of the project this session worked in (`git rev-parse --show-toplevel`), or the current folder if it is not a git repo. If the session's work was in a different folder than the current one, use that folder.
- If a file with that name already exists, use `HANDOFF-YYYYMMDD-HHMMSS.md` instead. Never overwrite.
- The file name is the sort key. Resume picks the name that sorts last, not the newest modified time (checkouts and copies change modified times).
- If `.handoffs/` is not in the project's `.gitignore`, suggest adding it in the final message. Do not edit `.gitignore` unless asked.

---

## Mode: prompt (default)

### Step 1. Snapshot the project

Run from the project root:

```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT"
echo "ROOT=$ROOT"
echo "STAMP=$(date +%Y%m%d-%H%M)"
echo "NOW=$(date '+%Y-%m-%d %H:%M %Z')"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "BRANCH=$(git rev-parse --abbrev-ref HEAD)"
  # left = commits only on upstream (behind), right = commits only here (ahead)
  echo "BEHIND_AHEAD=$(git rev-list --count --left-right '@{upstream}...HEAD' 2>/dev/null || echo 'no upstream')"
  echo "CHANGED_TOTAL=$(git status --porcelain | wc -l | tr -d ' ')"
  echo "--- status (first 50) ---"; git status --porcelain | head -50
  echo "--- last 5 commits ---"; git log --oneline -5 2>/dev/null
else
  echo "BRANCH=(not a git repo)"
fi
if grep -qsE '^/?\.handoffs/?$' .gitignore; then echo "GITIGNORED=yes"; else echo "GITIGNORED=no"; fi
```

If any line looks wrong (empty root, error text), stop and tell the user instead of guessing.

### Step 2. Fill the handoff from the conversation

Infer every field from the conversation. Ask the user only if something critical is truly unclear.

- **Done this session**: what was built, changed or decided, with file paths.
- **Decisions in force**: what was chosen, why, and its effect. Include implicit choices and mark them "(implicit)".
- **Rules and limits**: what the next session must not do, what needs the user's OK, and constraints the user stated. A missed "don't do X" is the main way handoffs fail, so be thorough here.
- **Open questions and blockers.**
- **Task list**: the latest task or to-do list from this session, if one was kept.
- **Files touched**: paths from your own file edits this session.
- **Read these first**: the 1 to 5 files the next session must read before acting.
- **Mental model**: the goal, the current approach, and why. Free text, a few sentences.
- **Next action**: ONE concrete first instruction for the next session.
- **Session title**: `<project>: <topic of the next action>`, under 50 characters.

If the project keeps its own status file (for example `STATE.md`, `TODO.md`, `ROADMAP.md`) and this session changed a fact it holds, say so under "Stale project files". Do not edit those files from this skill unless the project's own instructions say to keep them current.

### Step 3. Write the file

Write to `<ROOT>/.handoffs/HANDOFF-<STAMP>.md` (create the folder if needed). No `{placeholders}` may remain.

```markdown
# Session handoff

**Created:** {NOW}
**Project root:** {ROOT}
**Branch:** {BRANCH}
**Session title:** {title}

## Why this handoff
{the user's reason, or inferred: context too long / end of day / blocked / paused}

## Goal and mental model
{what the user is trying to get done, the current approach, and why}

## Done this session
- {item, with file paths}

## Decisions in force
| Decision | Why | Effect |
|---|---|---|
| {decision} | {why} | {effect} |

## Rules and limits
- {what not to do, what needs the user's OK}

## Open questions and blockers
- {item, or "None."}

## Task list
- [x] {done}  - [~] {in progress}  - [ ] {not started}
(or "None tracked.")

## Git snapshot
Behind/ahead of upstream: {BEHIND_AHEAD}
Changed files: {CHANGED_TOTAL} (first 50 below)
    {git status lines}
Last 5 commits:
    {git log lines}

## Files touched
- {path}

## Stale project files
- {file and what is now out of date, or "None."}

## Read these first
- {path relative to the project root}

## Next action
{ONE concrete instruction}
```

### Step 4. Print the paste-ready prompt

Print a short confirmation, then the prompt inside a code block so the user can copy it into a new session in any agent:

```
Handoff saved: {absolute path to the file}
Decisions: {N}  Blockers: {N}  Files touched: {N}
```

````
```
Resume work from the handoff file at {absolute path}.
Read it in full, then the files listed under "Read these first".
Tell me in one line what the next action is, then do it.
Follow the "Rules and limits" section; ask before anything it says needs my OK.
```
````

Use the absolute path, because the next session may start in a different folder. If the next agent also has this skill, `resume {absolute path}` works too; mention that in one line.

Add the `.gitignore` suggestion if `GITIGNORED=no`. Then stop. Do not start the next action here.

---

## Mode: auto-start

This mode needs a harness tool that starts a new session and lets you message it. In the Claude desktop app these are the session-start tool (`start_session`) and `SendMessage`; load them with tool search if they are deferred.

1. Check for those tools first. **If they are not available** (terminal CLI, IDE extension, Codex, other agents): run `prompt` mode, and start the final message with "Auto-start needs the Claude desktop app's session tools, which this session does not have, so here is the prompt to paste instead."
2. If they are available: run `prompt` mode Steps 1 to 3, then follow `references/auto-start.md` to start ONE new session, brief it, check its readback, and close out here.

Asking for auto-start is the user's OK to start exactly one new session. It is not permission for anything else.

---

## Mode: close

Wrap up without a handoff file. The next step lives only in this message, so if the user needs it to survive, suggest `prompt` mode instead.

1. **List what this session changed**: files from your own edits. Compare with `git status --porcelain`.
2. **Commit only if the user asked to commit in this request** (an earlier request in the session does not count). Then:
   - Stage the intersection of "files this session changed" and "files git shows as changed", by explicit path: `git add -- path/one path/two`.
   - Any changed file you are not sure this session made goes under "Left for you to review", unstaged.
   - Commit on the current branch with a short message about this session's work. Use the user's note as the subject if they gave one. Add your harness's usual co-author line if it has one.
3. **Push only if the user asked to push in this request**, the branch has an upstream (`git rev-parse --abbrev-ref '@{upstream}'`), and nothing about the target looks unusual. Before pushing, show the remote and branch in one line. If there is no upstream, say the commit is local only.
4. **Print the closeout block**, then stop:

```
Session closed out
  Done:            {one line}
  Next step:       {ONE concrete next step, or "none, work complete"}
  Branch:          {branch}
  Committed:       {N files, short sha + subject} | not requested | nothing to commit
  Not committed:   {this session's changed files, or "none"}
  Pushed:          {remote/branch} | local only | not requested
  Left for review: {changed files not from this session, or "none"}
```

---

## Mode: resume

### Step 1. Find the handoff

- If the user gave a path, use it.
- Else look in `.handoffs/` at the git top level, then in the current folder, and take the file whose name sorts last:

```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
ls "$ROOT"/.handoffs/HANDOFF-*.md ./.handoffs/HANDOFF-*.md 2>/dev/null | sort -u | while read -r f; do echo "$(basename "$f") $f"; done | sort | tail -1 | cut -d' ' -f2-
```

- If none is found, say "No handoff found here. Give me the path to a HANDOFF file." and stop.

### Step 2. Read and check

1. Read the handoff in full, then every file under "Read these first".
2. Run `git status --porcelain` and `git log --oneline -5`. If the branch, the changed files or the commits disagree with the handoff's git snapshot, say so in one line. Someone may have worked since.
3. If the handoff's Created time is more than 7 days old, say so in one line.
4. Do not edit, move or delete the handoff file.

### Step 3. Report and act

Print:

```
Resumed from: {path}  (created {Created})
Goal: {one line}
Decisions in force: {N}   Open blockers: {N}
Conflicts: {one line, or "none"}
Next action: {the handoff's next action, in your own words}
```

Then do that one next action, following the handoff's "Rules and limits". If a conflict from Step 2 makes the next action unsafe or wrong, stop and ask instead.

If your harness can rename the session (the Claude desktop app has a session-title tool), rename it to the handoff's Session title. Skip quietly if not.

---

## Extension points

Teams often hook more into a handoff: a notes vault, a task tracker, a planning framework's state files. Add those as your own steps after Step 3 of `prompt` mode or after the closeout block of `close` mode. Keep them propose-first: show the change, write after the user says yes.
