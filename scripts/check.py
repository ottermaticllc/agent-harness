#!/usr/bin/env python3
"""Repo self-check: skill frontmatter, plugin manifests, marketplace entries, required files.

Run from the repo root: python3 scripts/check.py   (exit 1 on any problem)
"""
import json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
problems = []

market = json.loads((root / ".claude-plugin/marketplace.json").read_text())
listed = {p["name"]: p for p in market["plugins"]}

for plugin in sorted((root / "plugins").iterdir()):
    if not plugin.is_dir():
        continue
    name = plugin.name
    manifest = json.loads((plugin / ".claude-plugin/plugin.json").read_text())
    if manifest.get("name") != name:
        problems.append(f"{name}: plugin.json name is {manifest.get('name')!r}")
    if name not in listed:
        problems.append(f"{name}: missing from marketplace.json")
    elif listed[name].get("version") != manifest.get("version"):
        problems.append(f"{name}: version differs between plugin.json and marketplace.json")
    if not (plugin / "README.md").exists():
        problems.append(f"{name}: no README.md")
    for skill_md in plugin.glob("skills/*/SKILL.md"):
        text = skill_md.read_text()
        m = re.match(r"---\n(.*?)\n---\n", text, re.S)
        if not m:
            problems.append(f"{skill_md}: frontmatter must start on line 1")
            continue
        fm = dict(re.findall(r"^(\w[\w-]*):\s*(.*)$", m.group(1), re.M))
        folder = skill_md.parent.name
        if fm.get("name") != folder:
            problems.append(f"{folder}: name {fm.get('name')!r} must equal folder name")
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", folder) or len(folder) > 64:
            problems.append(f"{folder}: name must be lowercase-hyphen, max 64")
        desc = fm.get("description", "").strip()
        if not 1 <= len(desc) <= 1024:
            problems.append(f"{folder}: description length {len(desc)} (must be 1-1024)")
        if len(text.splitlines()) > 500:
            problems.append(f"{folder}: SKILL.md over 500 lines")
        for ref in re.findall(r"`((?:references|scripts|assets|templates)/[^`\s]+)`", text):
            if "<" not in ref and "*" not in ref and not (skill_md.parent / ref).exists():
                problems.append(f"{folder}: references missing file {ref}")

for name in listed:
    if not (root / "plugins" / name).is_dir():
        problems.append(f"marketplace lists {name} but plugins/{name} does not exist")

print("\n".join(problems) or f"OK: {len(listed)} plugins checked")
sys.exit(1 if problems else 0)
