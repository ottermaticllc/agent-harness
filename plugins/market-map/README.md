# market-map

A skill that builds a market map from public filings: who already serves a target set of buyers, how concentrated those providers are, and how much space is left, reported with an honest denominator.

## What it does

Some regulators require a filing that names both the buyer and the service provider acting for it (a benefits broker, a lender, an auditor, a lobbyist). That filing is a free competitive map. This skill walks the agent through it:

1. **Intake:** five questions, so the buyer is defined as a filing entity, not a persona.
2. **Source discovery:** a decision tree and a catalogue of public sources (`references/incumbent-naming-sources.md`) sorted by provider type, with a decline branch for markets no filing covers.
3. **Acquisition checks:** read the record layout, check the period, sample the provider field.
4. **Analysis:** normalize provider names, segment by size band, count buyers per provider, then find the unclaimed space.
5. **Report:** a template that puts "what this does not say" next to the numbers.

`scripts/concentration.py` does step 4's arithmetic from a CSV (Python 3 standard library only).

## When to use it

- "Who already serves these buyers?" or "is this market locked up?"
- Before building a lead list: separating displacement targets from greenfield.
- Scoping a competitive-landscape deliverable.

## Install

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install market-map@agent-harness
```

Other agents: `npx skills add ottermaticllc/agent-harness --skill market-map`, or copy `plugins/market-map/skills/market-map/` into your agent's skills folder (for example `~/.claude/skills/` or `~/.agents/skills/` for Codex). Needs `python3` for the script.

## Configuration

None.

## Example

Real run on 2026-11-18: the US Department of Labor Form 5500 Schedule A Part 1 bulk file for plan year 2025 (`F_SCH_A_PART1_2025_latest.csv`, from the Employee Benefits Security Administration's public disclosure datasets). It names the insurance broker on each retirement and welfare plan filing.

```
$ python3 scripts/concentration.py F_SCH_A_PART1_2025_latest.csv --provider INS_BROKER_NAME --buyer ACK_ID

Denominator: buyers present in this file only. Not the whole market.
== all rows: 62576 buyers in source ==
  with a named provider: 62047   no public provider footprint: 529
  distinct providers: raw 50231 -> normalized 40070
  top-10 share of named buyers: raw 30.3% -> normalized 37.2%
  leader: MARSH AND MCLENNAN AGENCY (7.4%)
```

What this shows, and does not show:

- Name normalization alone moved top-10 share from 30.3% to 37.2% and cut the provider count by about a fifth. Skipping it makes the market look more open than it is. Only suffixes and punctuation were folded here; hand-folding the top names would move it further.
- "Buyer" here is a filing (`ACK_ID`), not a plan sponsor: this file has no sponsor name or size. A real run would join the base Form 5500 file for sponsor identity and a size band, and report per band. The blended figure above is a test of the arithmetic, not a finding.
- This file lists only filings that report a broker on Schedule A. Plans with no insurance contract are invisible.

## What it reads, writes and sends

- **Reads:** public data files you download, and your own CSV. The script reads the CSV you name.
- **Writes:** the report file and notes you ask for, in your project. The script writes nothing; it prints.
- **Sends:** web requests to public government sites to fetch data (a normal run is a handful of requests), plus your agent's model calls. Raw files should not be committed.
- **Cost:** model time plus the data download. The catalogue marks paid sources; the skill says to ask before buying.

## Limits and known issues

- **The source catalogue is a snapshot dated 2026-07-25.** Only the Form 5500 Schedule A Part 1 file was re-checked on 2026-11-18 (its host now redirects to `www.askebsa.dol.gov`; the catalogue links were updated). Other URLs, field names and "VERIFIED" tags are unchecked since the snapshot. Government datasets move; check each before promising a deliverable.
- **Many markets cannot be mapped.** Solo practitioners, small agencies, consultants and most SMB services have no filing that names their providers. The skill's answer is to decline.
- **The script only normalizes** case, punctuation, legal suffixes and `&`/`and`. Folding spelling variants and abbreviations is manual (`--aliases`). It counts a buyer once per provider; it does not weight by dollars.
- **A named provider is not a current engagement,** and no named provider is not no provider. The skill makes the report say so, with a named counter-example.
- Some government hosts block scripts (the catalogue notes which, as of the snapshot). It was not checked whether those blocks still apply.
- The catalogue was written in 2026 and covers US sources only.

## Author

Jared Schulman, OtterMatic LLC (https://jaredschulman.com)
