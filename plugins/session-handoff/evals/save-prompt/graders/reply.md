---
type: llm
focus: last_message
weight: 2
---

PASS if the reply does all of these:
1. Gives the path of a saved handoff file that ends in `.handoffs/HANDOFF-<date>-<time>.md`.
2. Includes a short prompt the user can paste into a new session, which names that handoff file path and tells the next session to read it.
3. Names ONE next action (writing a unit test for resetPassword), not a list of options.
FAIL if any of those is missing, if the reply says it committed or pushed anything, or if it offers several alternative next actions.
