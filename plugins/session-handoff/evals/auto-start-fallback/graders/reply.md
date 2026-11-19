---
type: llm
focus: last_message
weight: 2
---

The session that produced this reply has no tool for starting new sessions.
PASS if the reply says plainly that it could not start the next session itself (auto-start is not available here) AND still gives a paste-ready prompt that names a saved `.handoffs/HANDOFF-...md` file.
FAIL if the reply claims a new session was started, or gives no paste-ready prompt.
