---
name: market-map
description: Builds a market map from public filings that name both a buyer and the service provider acting for it, then reports how concentrated the providers are and how much space is unclaimed, with an honest denominator. Use when someone asks who already serves a target market, whether a market is locked up, who the real competitors are, or before building a lead list.
license: MIT
---

# Market Map

Question answered: **who currently serves the buyers I want, and how locked in are they?**

Sometimes a regulator already answers it. When a mandatory public filing names the buyer *and* the provider acting for it (broker, counsel, auditor, lender, contractor), the competitive map of a market is a free spreadsheet.

Not a demand report (who shows buying signals). Not a lead list (though incumbent-named buyers are displacement targets). Not possible for every market: the decision tree ends in a decline branch. Take it.

## 1. Intake: get five answers before touching data

1. **Buyer, as a filing entity.** Not a persona: "employers sponsoring a benefit plan", "SBA loan borrowers", "companies that lobby". If the buyer is a person, most sources are out.
2. **Service and incumbent category.** What is sold, and who does the buyer buy it from today?
3. **Size band served.** Push for a number the data can express (filings, participants, dollars). It becomes the segmentation cut.
4. **Geography.**
5. **The decision riding on it.** Locked up or open? Displacement or greenfield? Who is the real competitor? This picks which cut leads the report.

Also check whether anyone has already pulled this data in the project folder.

## 2. Source discovery (stop at the first yes)

- **Q1** Must the buyer file something to operate? No: go to Q5.
- **Q2** Does the filing name a third party acting for the buyer? Look it up in `references/incumbent-naming-sources.md` (organized by provider type: start from what is sold). No: go to Q4.
- **Q3** Is it entity-level, free, machine-readable, with the provider field actually populated and a documented record layout? Yes: you have a market map, go to step 3. PDF-only or lookup-only: a sampled map at best; say so up front.
- **Q4** Does a filing exist on the provider side that names its clients (lobbying registrations, fund service providers, subawards)? Use it, but the denominator becomes "providers who register".
- **Q5** Fallback signals (website technology, DNS/MX records, procurement awards): a partial map. State the coverage limit in the first paragraph.
- **Q6** Nothing? **Decline.** Agency portfolio pages and directory listings are self-reported, survivorship-biased and have no denominator; a map built from them is worse than none. Offer a demand-side view instead and say why incumbency can't be answered.

## 3. Acquire and verify before promising numbers

1. Read the **record layout**, not the column headers. Layouts and data disagree (`Y/N` vs `Yes/No`). Cite the layout file.
2. Check the file's **period**: min/max on the date field. "Q4" files are sometimes quarter-only while the page says cumulative.
3. Check for **schema breaks across years**; some forms have two incompatible versions in one year.
4. Count **populated rows**, not row elements (spreadsheets carry formatting rows).
5. Sample 100 rows: is the provider field **populated**, not just defined?
6. Government hosts often block scripts. Send an identifying User-Agent; if blocked, try the archive route noted in the catalogue and record which copy you used.
7. Note the **identifier**: is there a stable entity ID? If only names, measure the error rate on a sample.
8. Keep raw files out of version control. Record URL, retrieval date, checksum.

## 4. Analysis

**Buyer key.** Uppercase, strip punctuation and legal suffixes (INC, LLC, CORP, LTD, LLP, PLLC, GROUP, HOLDINGS). Use a real ID when one exists.

**Provider names: normalize first. This is a gate, not a footnote.** Never compute concentration on raw provider strings. One firm under four spellings splits its share and makes the market look more open than it is. The error runs one way: toward the flattering answer.

1. Normalize (case, punctuation, suffixes, `&`/`and`).
2. Rank raw strings by frequency; hand-review the top 100.
3. Fold variants (leading distinctive token, known abbreviations). Review every group; leading-token matching over-merges common surnames.
4. Record before and after. If top-10 share moved, publish both.
5. If variants remain, say so and say which direction the error runs.

**Segment before computing.** Choose 4-6 size bands the reader recognizes. Never report one blended concentration figure: bands behave differently, and the reader sells into one of them.

**Per band, report:** buyers in band; buyers with a named provider; buyers with none; distinct providers; top-10 share and leader share (count **buyers** per provider, not records, unless revenue scales with volume; say which); HHI if comparing bands.

`scripts/concentration.py` does the normalization and the per-band table from a CSV (standard library only):

```
python3 scripts/concentration.py filings.csv --provider PROVIDER_COL --buyer BUYER_COL --band BAND_COL [--aliases folds.csv]
```

It prints raw vs normalized top-10 share. Folding variants is still your job (`--aliases`, two columns: variant, canonical).

**The unclaimed space** (buyers with no named provider) is the headline number and the one most likely to be wrong. Report it as *no public provider footprint*, never *no provider*, and publish one named counter-example from the data.

## Guardrails

1. **Honest denominator.** Count only buyers present in the source. "89% of small filers already have a named broker" is wrong if it should read "of small filers *who filed this form*". If the invisible population is the one the reader wants, say so in the body, not the appendix.
2. **A named provider is not proof of a current engagement. No named provider is not proof of none.** Filings are historical; in-house teams and unnamed engagements are invisible. The positive signal is strong (a safe disqualifier); the negative signal is only a prioritization hint. Publish a named counter-example: an abstract disclaimer gets skimmed, a named company that breaks the rule is remembered.
3. **Three labels, not two:** `has_provider`, `no_provider_footprint`, `ambiguous`. Ambiguous absorbs agent-not-attorney records, missing fields, contradictions.
4. **Provenance per row:** source file, provider name as filed, last filing date, match confidence.
5. **Cite the file:** exact filename, record count, coverage window, retrieval date. Every number traces to a file on disk.

## Output

Fill `templates/market-map-report.md`. Order: why this matters, the answer (segmented tables), what it says, what it does not say, recommended use, provenance, method appendix. Save it in the project's research folder. Nothing is sent or published by this skill.

## Notes

- Re-verify every source URL before a run. The catalogue is a dated snapshot; its status tags (VERIFIED / UNCERTAIN / RULED OUT) describe that snapshot only.
- Subagents (Claude Code) can fetch and profile several candidate sources in parallel; without them, do it one source at a time.
- Costs: free sources, so the only cost is model time. A paid source in the catalogue is marked as such; ask before buying.
