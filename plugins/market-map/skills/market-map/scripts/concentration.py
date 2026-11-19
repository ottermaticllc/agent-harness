#!/usr/bin/env python3
"""Provider concentration from a CSV of filings: raw vs normalized, optionally per size band.

usage: concentration.py FILE.csv --provider COL --buyer COL [--band COL] [--aliases FILE.csv] [--top 10]

Counts BUYERS per provider (a buyer with two providers counts once for each).
Normalization: uppercase, strip punctuation and legal suffixes. --aliases is a
two-column CSV (variant,canonical), applied after normalization, for the folds
you hand-review. Empty provider = no public provider footprint, not "no provider".
"""
import argparse, csv, re, sys
from collections import defaultdict

SUFFIX = {"INC", "LLC", "CORP", "CORPORATION", "LTD", "CO", "COMPANY", "LLP", "LP", "PLLC", "PC", "THE"}


def norm(s):
    words = re.sub(r"[^A-Z0-9 ]", " ", s.upper().replace("&", " AND ")).split()
    while words and words[-1] in SUFFIX:
        words.pop()
    return " ".join(w for w in words if w != "THE")


def stats(rows, key, top):
    """rows: (buyer, provider_raw, band). key: function raw provider -> folded name."""
    buyers = {b for b, _, _ in rows}
    by_prov = defaultdict(set)
    for b, p, _ in rows:
        if p.strip():
            by_prov[key(p)].add(b)
    named = set().union(*by_prov.values()) if by_prov else set()
    ranked = sorted(by_prov.items(), key=lambda kv: -len(kv[1]))
    t = len(set().union(*[v for _, v in ranked[:top]])) if ranked else 0  # union: a buyer with two top providers counts once
    return dict(buyers=len(buyers), named=len(named), none=len(buyers) - len(named),
                providers=len(by_prov), top_share=t / max(len(named), 1),
                leader=ranked[0][0] if ranked else "", leader_share=len(ranked[0][1]) / max(len(named), 1) if ranked else 0)


def show(title, rows, aliases, top):
    folded = lambda p: aliases.get(norm(p), norm(p))
    raw = stats(rows, lambda p: p.strip().upper(), top)
    new = stats(rows, folded, top)
    print(f"\n== {title}: {new['buyers']} buyers in source ==")
    print(f"  with a named provider: {new['named']}   no public provider footprint: {new['none']}")
    print(f"  distinct providers: raw {raw['providers']} -> normalized {new['providers']}")
    print(f"  top-{top} share of named buyers: raw {raw['top_share']:.1%} -> normalized {new['top_share']:.1%}")
    print(f"  leader: {new['leader']} ({new['leader_share']:.1%})")


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("file"); a.add_argument("--provider", required=True); a.add_argument("--buyer", required=True)
    a.add_argument("--band"); a.add_argument("--aliases"); a.add_argument("--top", type=int, default=10)
    a = a.parse_args()
    aliases = {}
    if a.aliases:
        with open(a.aliases, newline="", encoding="utf-8") as f:
            aliases = {norm(r[0]): norm(r[1]) for r in csv.reader(f) if len(r) >= 2}
    rows = []
    with open(a.file, newline="", encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            if a.provider not in r or a.buyer not in r or (a.band and a.band not in r):
                sys.exit(f"column not found; columns are: {list(r)}")
            rows.append((r[a.buyer], r[a.provider], r[a.band] if a.band else ""))
    print("Denominator: buyers present in this file only. Not the whole market.")
    if a.band:
        for band in sorted({b for _, _, b in rows}):
            show(f"band {band!r}", [r for r in rows if r[2] == band], aliases, a.top)
    else:
        show("all rows (no size band; do not report this blended figure to a client)", rows, aliases, a.top)


if __name__ == "__main__":
    main()
