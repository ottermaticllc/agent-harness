---
type: llm
focus: last_message
weight: 3
---

Two handoff files exist. The newest by name (2026-11-17) says the next action is to write a unit test for resetPassword; the older one (2026-11-01) says to add rate limiting to login.
PASS if the reply resumes from the 2026-11-17 handoff, states ONE next action about the resetPassword unit test, and does not present rate limiting as the next action. Mentioning that src/auth.js must not be changed is a plus but not required.
FAIL if it resumes from the 2026-11-01 handoff, names rate limiting as the next action, or lists several options instead of one.
