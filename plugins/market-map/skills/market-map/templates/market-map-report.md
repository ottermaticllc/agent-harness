# {Buyer-facing question the map answers} — answered from public data

**Date:** {YYYY-MM-DD}
**Prepared for:** {who asked} · **The buyer:** {buyer definition} · **Service they sell:** {service}
**Source:** {dataset name}, `{exact filename or endpoint}` ({N} records, {coverage window}). {Free/paid, mandatory/voluntary, public}.
**Cost to produce:** {"zero — no vendor data" if true, else the actual spend}

---

## Why this matters

> One short paragraph. State the commercial question in the reader's own words — ideally the
> question they have been guessing at. Then say, plainly, that a public filing answers it.
> Name the field that does the work.
>
> Example shape: "Every {filing} names the {provider} representing the {buyer}
> (`{FIELD_NAME}`). So the competitive map is public."

---

## The answer

**{N} buyers, {M} records.** Split by {size band variable}, because the bands behave differently.

### {Band 1 label} — {range} — {the reader's stated market}

| | |
|---|---:|
| Buyers | {n} |
| **Already have a named {provider}** | **{n} ({x}%)** |
| No named {provider} | {n} ({x}%) |
| Distinct {providers} serving them | **{n}** |
| **Top-10 share** | **{x}%** |

| Rank | {Provider} | Buyers | Share |
|---:|---|---:|---:|
| 1 | {name} | {n} | {x}% |
| … | | | |
| 10 | {name} | {n} | {x}% |

*{Normalization note — which variant families were folded, and what the pre-normalization
numbers were if the difference is material. If any remain unfolded, say which and which
direction the error runs.}*

### {Band 2 label} — {range}

Top-10 share is **{x}%** — {n}× {more/less} concentrated. {Leader} alone holds {x}%.

---

## What this says

**1. {Concentration verdict — is the market locked up or open?}** {n} providers share {n}
buyers and the leader holds about {x}%. {State plainly whether the incumbent-lock-in worry
holds, and in which band.}

**2. But {x}% already have a {provider}.** The "{buyers with no provider yet}" framing addresses
at most {x}% of buyers who appear in the source, and even that is *no public {provider}
footprint*, not *no {provider}*. The defensible claim is **displacement**.

**3. {What this asset is worth relative to the alternatives.}** {Whether a paid vendor could
produce this, and at what price.}

---

## What it does not say

- **It only covers buyers who {trigger the filing}.** {The population that is structurally
  invisible, named concretely — and whether that population is the one the reader actually wants.}
- **A named {provider} is not proof of a current engagement**, and no named {provider} is not
  proof of no {provider}.
- **{Worked example of the trap}** — {a specific named entity in the data whose classification
  is obviously wrong, and why}.
- {Any lag, denominator, or identity-resolution caveat that materially changes how a number
  should be read.}

---

## Recommended use

> How the reader should actually deploy this in a conversation. Concrete. If the map reframes
> a meeting or a pitch, say how.
>
> Then: **the question the data cannot answer**, handed back to the reader as the thing only
> they know.

---

## Provenance note

{Where the data came from, what was computed here vs. reused, and any lesson worth recording
for the next run. If prior work on disk was duplicated, say so — that is a finding.}

---

## Method appendix

| Step | Choice made | Why |
|---|---|---|
| Source | {dataset} | {why this one} |
| Denominator | {buyers present in source} | never the full market — see honest-denominator rule |
| Buyer key | {field / normalization} | {drift rate if measured} |
| Provider key | {normalization applied} | variant folding is mandatory |
| Size bands | {cut points} | {why these cuts} |
| Concentration metric | top-10 share {and HHI if computed} | {} |
| Window | {dates} | {lag} |
