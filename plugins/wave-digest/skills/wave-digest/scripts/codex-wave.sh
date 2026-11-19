#!/usr/bin/env bash
# wave-digest for Codex CLI (or any harness without native subagents).
# Wave 1: three `codex exec` processes in parallel. Wave 2: one writer.
# Codex runs in its read-only sandbox and only prints; this script writes every file.
# Usage: codex-wave.sh <projects-folder> [out-dir] [hours]
# Env: WAVE_TIMEOUT (seconds per worker, default 300), WAVE_MODEL (optional codex model).
set -u
ROOT=$(cd "${1:?usage: codex-wave.sh <projects-folder> [out-dir] [hours]}" && pwd) || exit 2
DATE=$(date +%F)
OUT=${2:-./wave-digest/$DATE}
HOURS=${3:-24}
LIMIT=${WAVE_TIMEOUT:-300}
HERE=$(cd "$(dirname "$0")" && pwd)
PROMPTS="$HERE/../references/prompts"
mkdir -p "$OUT/.status" && OUT=$(cd "$OUT" && pwd)
command -v codex >/dev/null || { echo "codex CLI not found" >&2; exit 2; }

now() { date -u +%FT%TZ; }

# Portable timeout (macOS has no `timeout`). Runs the command in its own process
# group and kills the whole group, because the codex launcher spawns a child
# that would otherwise keep running (and could still write its file) after a kill.
TIMEOUT_PL='$t = shift; $p = fork; if (!$p) { setpgrp(0, 0); exec @ARGV or exit 127 }
$SIG{ALRM} = sub { kill "TERM", -$p; sleep 2; kill "KILL", -$p; exit 124 };
alarm $t; waitpid($p, 0); exit($? >> 8)'

status() { # worker state started [error-text]
  local err="" done=""
  [ -n "${4:-}" ] && err="\"$4\""
  [ "$2" = running ] || done=$(now)
  printf '{"agent": "%s", "status": "%s", "started_at": "%s", "completed_at": "%s", "output_files": ["%s.md"], "errors": [%s]}\n' \
    "$1" "$2" "$3" "$done" "$1" "$err" > "$OUT/.status/$1.json"
}

prompt() { # fill the placeholders in one prompt file
  sed -e "s|{ROOT}|$ROOT|g" -e "s|{HOURS}|$HOURS|g" -e "s|{MINUTES}|$((HOURS * 60))|g" \
      -e "s|{OUT}|$OUT|g" -e "s|{DATE}|$DATE|g" \
      -e "s|{OUTPUT}|Do not write any files. Print the full Markdown report as your final message and nothing else.|" \
      "$PROMPTS/$1.md"
}

run() { # worker-name working-dir
  local w=$1 dir=$2 start
  start=$(now)
  status "$w" running "$start"
  if perl -e "$TIMEOUT_PL" "$LIMIT" \
       codex exec -s read-only --skip-git-repo-check --ephemeral ${WAVE_MODEL:+-m "$WAVE_MODEL"} \
       -C "$dir" -o "$OUT/$w.md" "$(prompt "$w")" > "$OUT/.status/$w.log" 2>&1 < /dev/null \
     && [ -s "$OUT/$w.md" ]; then
    status "$w" complete "$start"
  else
    status "$w" error "$start" "codex failed, timed out after ${LIMIT}s, or printed nothing; see .status/$w.log"
  fi
}

echo "Wave 1: git, todos, notes in parallel (timeout ${LIMIT}s each)"
for w in git todos notes; do run "$w" "$ROOT" & done
wait

echo "Validate:"
"$HERE/validate.sh" "$OUT" git todos notes
# No automatic recovery here: a failed worker stays failed and the writer reports it under Coverage.
# Re-running a worker, or running its commands yourself, is the orchestrator's call (see SKILL.md).

echo "Wave 2: digest writer"
run digest "$OUT"
if grep -q '"status": "complete"' "$OUT/.status/digest.json"; then
  echo "Done: $OUT/digest.md"
else
  echo "No digest written; see $OUT/.status/digest.log" >&2; exit 1
fi
