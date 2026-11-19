#!/usr/bin/env bash
# Builds a small fake git project in the empty eval workspace.
set -euo pipefail
g() { git -c user.name="Eval" -c user.email="eval@example.com" "$@"; }
git init -q -b main .
mkdir -p src tests
printf "export function login(user, pass) {\n  return user && pass;\n}\n" > src/auth.js
printf "# Acme app\n" > README.md
printf "node_modules/\n" > .gitignore
g add -A && g commit -qm "Initial commit"
printf "export function resetPassword(email) {\n  return sendResetEmail(email);\n}\n" > src/reset.js
g add src/reset.js && g commit -qm "Add password reset"
printf "\n// TODO: rate limit\n" >> src/auth.js
