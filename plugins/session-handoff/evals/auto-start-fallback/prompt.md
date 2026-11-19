---
max_turns: 25
timeout_seconds: 400
runs: 1
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write]
---

Context for this session (we did this together earlier today): we added src/reset.js with a resetPassword function and committed it. I decided reset links must expire after 30 minutes because the security review asked for it. I also said: do not touch src/auth.js, another person owns it this week. I left a TODO comment in src/auth.js by mistake; it is uncommitted. Still open: which email provider to use. The next thing to do is write a unit test for resetPassword in tests/reset.test.js.

Hand this off with auto-start: start the next session for me and brief it.
