#!/usr/bin/env bash
# Fake project with two handoffs. The OLDER one is touched last, so a
# modified-time sort picks the wrong file; a name sort picks the right one.
set -euo pipefail
g() { git -c user.name="Eval" -c user.email="eval@example.com" "$@"; }
git init -q -b main .
mkdir -p src .handoffs
printf "export function resetPassword(email) {\n  return sendResetEmail(email);\n}\n" > src/reset.js
printf ".handoffs/\n" > .gitignore
g add -A && g commit -qm "Add password reset"
cat > .handoffs/HANDOFF-20261117-1630.md <<'MD'
# Session handoff

**Created:** 2026-11-17 16:30 UTC
**Project root:** (eval workspace)
**Branch:** main
**Session title:** Acme app: password reset test

## Why this handoff
End of day.

## Goal and mental model
Ship password reset. The reset function exists in src/reset.js; it has no test yet.

## Done this session
- Added src/reset.js with resetPassword(email).

## Decisions in force
| Decision | Why | Effect |
|---|---|---|
| Reset links expire after 30 minutes | Security review asked for it | Tests must cover expiry |

## Rules and limits
- Do not change src/auth.js; another person owns it this week.

## Open questions and blockers
- None.

## Task list
None tracked.

## Git snapshot
Behind/ahead of upstream: no upstream
Changed files: 0
Last 5 commits:
    abc1234 Add password reset

## Files touched
- src/reset.js

## Stale project files
- None.

## Read these first
- src/reset.js

## Next action
Write a unit test for resetPassword in tests/reset.test.js that checks a reset email is sent.
MD
cat > .handoffs/HANDOFF-20261101-0900.md <<'MD'
# Session handoff

**Created:** 2026-11-01 09:00 UTC
**Branch:** main
**Session title:** Acme app: login rate limit

## Why this handoff
Paused.

## Done this session
- Wrote src/auth.js login.

## Rules and limits
- None.

## Read these first
- src/auth.js

## Next action
Add rate limiting to login in src/auth.js.
MD
sleep 1
touch .handoffs/HANDOFF-20261101-0900.md
