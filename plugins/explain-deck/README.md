# explain-deck

A skill that turns one topic from your own local files into a short, offline HTML explainer deck with speaker notes, a source on every slide and a 5-question self-quiz.

## What it does

You point it at some files (notes, docs, a project folder) and a topic. It reads them and writes one HTML file:

- Title slide, 6-10 content slides, and a quiz slide.
- Seven layouts (idea, compare, steps, text table, numbers with bars, title, quiz), chosen per slide.
- Plain-text speaker notes on every content slide, where the depth lives.
- A source footer on every slide: the file paths each fact came from.
- A quiz of exactly 5 questions with hidden answers.

The deck is built for learning a topic, not for presenting to a room.

Arrow keys move between slides. `N` shows the speaker notes. Printing to PDF gives one slide per page with notes. The page loads nothing from the internet and uses no fonts, images or libraries from elsewhere.

## When to use it

- You have notes or documents on a topic and want to learn it, not just skim it.
- You want a study aid you can open anywhere with no setup.

Not for decks you will present to others: there are no images, themes or animation.

## Install

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install explain-deck@agent-harness
```

Other agents: `npx skills add ottermaticllc/agent-harness --skill explain-deck`, or copy `plugins/explain-deck/skills/explain-deck/` into your agent's skills folder (for example `~/.claude/skills/` or `~/.agents/skills/` for Codex). Needs a shell with `sh` and `grep` for the check script; the agent does the rest.

## Configuration

None. Tell the agent which files and which topic.

## Example

Input: `notes/caching.md` (a short page on how a website cache works). Prompt: `make an explainer deck on how the cache works from the notes folder`.

Output: `explain-cache.html` with 7 slides: a title, a numbers slide ("The cache answers 92% of requests in a fraction of the time", with a bar for the 120 ms database read against the 4 ms cache read), a 3-step hit-or-miss flow, an expiry slide, an ownership table, a two-column "known problems" slide, and 5 quiz questions. Each content slide carries 60-120 words of notes and `Sources: notes/caching.md`.

Then run the check:

```
$ sh scripts/check-deck.sh explain-cache.html
OK: 7 slides (5 content), 5 notes, 5 quiz questions, no network references
```

## What it reads, writes and sends

- **Reads:** only the files you point to.
- **Writes:** one HTML file, in the folder you name or next to the sources. It does not overwrite an existing deck without asking.
- **Sends:** nothing of its own. Your agent's model call sees the text of the files it reads, like any other task. The skill uses no web search or fetch and uploads nothing.
- **Cost:** a normal model session: reading the sources plus writing one HTML file. Longer sources cost more.

## Limits and known issues

- **The model writes the deck.** Check the content against your sources. The script checks form (placeholders, notes, footers, quiz count, network references), not whether each sentence is true.
- **Source footers name files, not passages.** A fact is traceable to a file, not to a line.
- **No images or charts beyond CSS bars.** Intentional.
- **Layout limits** (word counts) are guidance to the model, not enforced by the script.
- Tested: one deck generated from a sample markdown file, opened in a browser with zero resource requests beyond the page itself. Dark mode follows the system setting. Not tested on a phone or in print.
- Only one template (`templates/deck.html`); no theming options.

## Credit

The method (outline, then layout choice, then slide fill-in, plus the content and layout rules) is adapted from [Presenton](https://github.com/presenton/presenton), Apache License 2.0. Only ideas and rule wording were adapted, in paraphrase, from the prompts in its `servers/fastapi/utils/llm_calls/` folder; none of its code, app, database, image generation or web search is used. See `NOTICE`. The template and the check script are original.

## Author

Jared Schulman, OtterMatic LLC (https://jaredschulman.com)
