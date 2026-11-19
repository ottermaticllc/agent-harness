---
name: explain-deck
description: Turns one topic from local files you point to (notes, docs, a project folder) into a short offline HTML explainer deck with speaker notes, a source on every slide and a 5-question self-quiz, built to help you learn the topic. Use when asked to "make an explainer deck on X", "teach me X as slides", or "help me understand X with a deck" from your own material. Local files only; no web search and nothing is uploaded.
license: MIT
---

# explain-deck: local files to explainer deck and self-quiz

The goal is **learning**, not a pretty deck. Short slides carry the idea, speaker notes carry the depth, the quiz makes you recall it. Every fact comes from the files you point to.

Method adapted from Presenton (Apache-2.0). See `NOTICE` in this plugin.

## Hard rules

1. **Read-only on sources.** Never edit the material you read.
2. **No web search, no web fetch, no upload or publishing.** The deck is one self-contained HTML file; nothing loads from the internet.
3. **Every fact traces to a file you actually read.** Unknown means leave it out or say it is unknown. Short material means a short deck, not padding.
4. **Never state a claim as fact that a source only says.** A vendor blog, press release or talk gets "pitch" or "says" in the slide title.

## Step 0: topic, sources, save path

Ask one short question only if the topic is too vague for 6-10 slides. Otherwise go. Get the list of files or folder from the user; if none, ask. Save to `explain-<slug>.html` in the folder the user names, or next to the sources. Do not overwrite an existing file; add a date to the name.

## Step 1: gather

Read the relevant files fully. Note facts with their file path. Dedupe; newer beats older; mention a change only when it matters to understanding.

## Step 2: outline

6-10 content slides plus a title and a quiz. Each slide gets a `##` title that states the point (a claim, not a label: "Every request needs one named decider", not "Decision process"), about 40 words of content and its source paths. Order for learning: what it is, why it exists, how it works, who is involved, what is open or changing.

Writing rules:
- Write the content itself. Never "this slide", "this deck", "we will discuss", "here we show".
- Start with the subject, claim or fact. Leave dates out unless they matter.
- No bold or italic inside slide text.

## Step 3: pick a layout per slide

Seven layouts in `templates/deck.html`: `L-title`, `L-idea`, `L-compare`, `L-steps`, `L-table`, `L-number`, `L-quiz`.

- Table of numbers: `L-number` (stat tiles or bars), never `L-table`. Table of text: `L-table`. No table: never `L-table`.
- Sequence or process: `L-steps`. Two things side by side: `L-compare`. One core point: `L-idea`.
- No images. Vary adjacent layouts unless the content says otherwise. `L-title` first, `L-quiz` last.

## Step 4: fill the template

Copy `templates/deck.html` to the save path, replace `{{DECK_TITLE}}`, and replace every sample `<section>` with real ones in the same markup. Limits (rephrase to fit; never cut mid-sentence):

| Layout | Limits |
|---|---|
| `L-title` | title up to 10 words, subtitle up to 25 |
| `L-idea` | `.big` up to 25 words, up to 3 bullets of up to 15 words |
| `L-compare` | 2 columns, up to 4 bullets each of up to 10 words |
| `L-steps` | 3-6 steps, bold label up to 4 words plus up to 15 words |
| `L-table` | up to 4 columns, up to 6 rows, cells up to 10 words |
| `L-number` | up to 3 stat tiles; bars: `--v` = value / largest value x 100 |
| `L-quiz` | exactly 5 questions |

- **Speaker notes** (`<aside class="notes">`, plain text, 60-120 words) on every content slide: the deeper why and how. This is where the learning depth lives.
- **Sources footer** (`.src`) on every slide: file paths. The title slide names the source folder and the date, and says it was written by an AI assistant.
- **Quiz:** 5 questions that test understanding (why, what happens if, who decides), not trivia. Each answer sits in `<details>` and is backed by a fact on an earlier slide.
- Escape `&`, `<` in text as HTML. Do not add scripts, fonts, images or links that load remotely.

## Step 5: verify

Run `scripts/check-deck.sh <deck.html>`. It fails on leftover placeholders or sample text, any network reference, missing notes or source footers, or a quiz that is not 5 questions. Then re-read each sentence on slides, notes and quiz answers against your gathered facts and cut any that do not trace to a source. The script cannot do that part.

## Step 6: hand off

Tell the user the file path in one line (open it in a browser: macOS `open`, Linux `xdg-open`, Windows `start`). Keys: arrows move, `N` toggles speaker notes. Printing to PDF gives one slide per page with notes.
