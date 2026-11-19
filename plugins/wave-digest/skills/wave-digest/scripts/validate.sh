#!/usr/bin/env bash
# Check one wave's handoff files. Usage: validate.sh <out-dir> <worker>...
# For each worker: <out>/<worker>.md must exist with more than 3 lines, and
# <out>/.status/<worker>.json must exist and not still say "running".
# Prints one line per worker and exits 1 if any worker needs recovery.
out=${1:?usage: validate.sh <out-dir> <worker>...}; shift
bad=0
for w in "$@"; do
  f="$out/$w.md"; s="$out/.status/$w.json"; problem=""
  if [ ! -f "$f" ]; then problem="output missing"
  elif [ "$(wc -l < "$f")" -le 3 ]; then problem="output has 3 lines or fewer (possible stall)"
  fi
  if [ ! -f "$s" ]; then problem="${problem:+$problem; }status missing"
  elif grep -q '"status": *"running"' "$s"; then problem="${problem:+$problem; }status still running"
  elif grep -q '"status": *"error"' "$s"; then problem="${problem:+$problem; }status error"
  fi
  if [ -n "$problem" ]; then echo "RECOVER $w: $problem"; bad=1; else echo "OK      $w"; fi
done
exit $bad
