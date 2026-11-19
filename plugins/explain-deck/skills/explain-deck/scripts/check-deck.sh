#!/bin/sh
# usage: check-deck.sh deck.html   (exit 0 = all checks pass)
f="$1"; [ -f "$f" ] || { echo "usage: check-deck.sh deck.html"; exit 2; }
fail=0
bad() { echo "FAIL: $1"; fail=1; }
grep -q '{{' "$f" && bad "unfilled {{placeholder}}"
grep -qE '\(sample\)|sample source folder|Sample question|Deeper explanation goes here|Explain what changed|Walk through each step|Explain the roles|Say where each number' "$f" && bad "template sample text left in"
# offline: nothing may load from another origin. Visible links in text are fine; src/href/url()/@import/fetch are not.
grep -qiE '(src|href)="(https?:)?//|url\((["'"'"']?)(https?:)?//|@import|fetch\(|XMLHttpRequest|<link[^>]*rel="?(stylesheet|preload)' "$f" && bad "possible network request (src/href/url()/@import/fetch)"
slides=$(grep -c '<section class="slide' "$f")
content=$(grep -E '<section class="slide' "$f" | grep -vcE 'L-title|L-quiz')
notes=$(grep -c '<aside class="notes"' "$f")
srcs=$(grep -c 'class="src"' "$f")
[ "$notes" -ge "$content" ] || bad "speaker notes ($notes) fewer than content slides ($content)"
[ "$srcs" -ge "$slides" ] || bad "source footers ($srcs) fewer than slides ($slides)"
q=$(awk '/L-quiz/{q=1} q' "$f" | grep -c '<details>')
[ "$q" -eq 5 ] || bad "quiz has $q questions, need exactly 5"
[ $fail -eq 0 ] && echo "OK: $slides slides ($content content), $notes notes, $q quiz questions, no network references"
exit $fail
