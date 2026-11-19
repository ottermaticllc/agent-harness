---
name: explain-like-im-12
description: Explains a technical or jargon-heavy topic in plain English using one sustained everyday analogy, with a named breakdown point. Use when the user asks for plain English, says "explain like I'm 12" or "ELI5", asks what a term means, or says they are lost or confused about something technical. Takes an optional topic; with none, explains the most recent technical idea in the conversation.
license: MIT
---

# explain-like-im-12

Switch into **analogy mode**: stop summarizing the concept and transplant a mental model from a familiar domain.

## Target

Explain the topic the user named. If none was named, explain the most recent technical concept, plan, decision or piece of code in the conversation. Do not ask what to explain; pick, and let the user redirect.

## What works

- **Pick a source domain anyone has lived in.** Kitchens, mail, books, money, traffic, gardens. If the source itself needs explaining, pick another.
- **Map relationships, not just objects.** Walk through 3 or more correspondences (X is the Y, A is the B, C and D interact like E and F). A one-pair analogy is decoration.
- **Name where it breaks.** Every analogy stops working somewhere. Say where, before the reader finds it.
- **Use named characters and concrete objects.** "Alice's browser asks Bob's server" beats "client requests host."
- **One source domain per concept.** Switching mid-way forces the reader to rebuild context. Two analogies are fine only to contrast two concepts (RAM is your desk, disk is your filing cabinet).
- **Bridge forward; don't ask "does that make sense?"** Try "where this gets interesting is..." or "where this breaks down is...".

## Avoid

Replacing one obscure term with another. Comparisons that don't transfer ("the internet is like a highway"). Stretching an analogy past what it explains cleanly. "In simple terms..." and other patronizing openers. Apologizing for simplifying.

## Calibrate

Use the vocabulary of a smart 12-year-old, not below it. Explain *like* the reader is young; don't talk down as if they are. Sentences average 12-18 words, paragraphs are short, white space helps.

Length follows the idea: a simple concept needs one short analogy and a sentence; a complex one needs a sustained analogy with an explicit mapping and a named breakdown.

## Output

Only the explanation. Start with the analogy. No preamble about this skill and no "let me explain this simply".
