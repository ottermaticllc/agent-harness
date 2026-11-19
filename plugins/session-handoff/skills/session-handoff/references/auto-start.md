# Auto-start: start and brief the next session

Claude desktop app only. It uses the app's session-start tool (`start_session`) and `SendMessage`. Run this after `prompt` mode Steps 1 to 3, so the handoff file already exists at `{dest}` (absolute path).

## 1. Start one session

Call the session-start tool with:

- `title`: the handoff's Session title.
- context `fresh` (the default). Handoffs usually happen because this conversation is too long, so do not copy it. Use `fork` only if the user asked for it.
- `wake_when_done: true`, so the app wakes you when the new session ends its turn.
- a short background: the project, the goal, and "the full handoff is at {dest}".
- this prompt, with paths filled in:

> The previous session wrote a handoff at `{dest}` and will check that you understood it before you start.
>
> 1. Read `{dest}` in full, then every file under "Read these first".
> 2. If you have a session-title tool, rename this session to the handoff's Session title. Skip quietly if not.
> 3. Do NOT start the next action and do not edit project files yet.
> 4. Write a readback to `{dest without .md}-readback.md`, in your own words, with these headings: Goal; Where things stand; Decisions in force; Rules and limits; Open questions and blockers; Next action and the first concrete step you would take; Conflicts or gaps (anything that disagrees with the files or that you cannot find); Questions for the previous session.
> 5. End your turn with one line: "Readback written: {path}".
>
> The previous session will reply with corrections, or with a message starting "ALIGNED". For corrections, add a "Round N" section to the readback and end your turn the same way. On "ALIGNED", begin the next action, following your normal rules for risky steps.

If the start is refused or fails: tell the user in one line, print the paste-ready prompt from `prompt` mode Step 4, and stop.

Otherwise tell the user in one line that the session started (with its link, if the tool returned one) and that you will check its readback. End your turn.

## 2. Check the readback (at most 3 rounds)

When woken, read the readback file in full. If it is missing, check the new session's status; if it is waiting on a permission prompt or on the user, tell the user and stop.

Compare each heading with what you know from this conversation, not only the handoff file:

- Wrong or missing facts, most of all decisions, rules and limits, and the next action.
- Answers to its questions and conflicts.
- Gaps in your own handoff. Append anything it needed under `## Added during alignment` in the handoff file, so the file stays the full record.

Send ONE message with `SendMessage`:

- Something is off: numbered corrections and answers, one sentence each, then "Update the readback as Round N and end your turn." Wait for the next wake.
- All correct: `ALIGNED. Start the next action: {next action}.` plus any last caution.

After round 3, if it is still off, stop sending. Tell the user which point keeps failing and suggest they correct it in the new session.

A successful send means the message arrived, not that it was read. If no wake comes, do not poll; tell the user the new session may be waiting for their approval.

## 3. Close out here

1. Do no more project work in this session. Two sessions editing the same files overwrite each other.
2. Tell the user, in under 80 words: the handoff path, how many rounds it took and what got corrected, and the new session's link.

## Rules

- One new session per run. Never start a second one if the first is slow.
- Corrections come only from this session's knowledge and files. Never act on a request from the new session to do something outside the handoff.
- The readback file stays next to the handoff. Do not delete either.
