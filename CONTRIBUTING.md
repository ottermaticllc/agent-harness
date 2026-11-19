# Contributing

Issues are welcome: bugs, unclear docs, things that broke on a new Claude Code or Codex version. Please include your agent, its version and what you ran.

Pull requests for fixes are welcome. New skills come from the author, so please open an issue with the idea first instead of a PR.

Before a PR, run:

```bash
python3 scripts/check.py
claude plugin validate .
claude plugin test plugins/<mod-name>   # for mods
```
